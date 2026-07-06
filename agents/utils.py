import os
import json
import logging
from typing import Optional, Type, Dict, Any
from pydantic import BaseModel

# Set up logger
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("LifePilot.utils")

# Try importing the official google-genai library
try:
    from google import genai
    from google.genai import types
    HAS_GENAI_SDK = True
except ImportError:
    HAS_GENAI_SDK = False
    logger.warning("google-genai SDK not found. Will try to fall back to google-generativeai or raw requests.")

# Check for fallback
if not HAS_GENAI_SDK:
    try:
        import google.generativeai as legacy_genai
        HAS_LEGACY_SDK = True
    except ImportError:
        HAS_LEGACY_SDK = False
        logger.warning("google-generativeai SDK not found. Standard API calls will fail unless library is installed.")


def get_gemini_api_key() -> Optional[str]:
    """Retrieves and validates the GEMINI_API_KEY environment variable. Optional if USE_VERTEX is true."""
    api_key = os.environ.get("GEMINI_API_KEY")
    use_vertex = os.environ.get("USE_VERTEX", "").lower() == "true"
    if not api_key and not use_vertex:
        raise ValueError("GEMINI_API_KEY environment variable is not set. Please set it before running the application.")
    return api_key


def _call_gemini_api(
    prompt: str,
    system_instruction: Optional[str] = None,
    use_search: bool = False,
    response_schema: Optional[Type[BaseModel]] = None,
    temperature: float = 0.2
) -> str:
    """Sends a raw request to Google Gemini API with a safety rate-limit sleep."""
    import time
    # Safety delay (only needed for free tier AI Studio; Vertex AI is high-throughput)
    use_vertex = os.environ.get("USE_VERTEX", "").lower() == "true"
    if not use_vertex:
        time.sleep(2.0)
        
    model_name = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
    
    if HAS_GENAI_SDK:
        try:
            if use_vertex:
                project = os.environ.get("GCP_PROJECT")
                location = os.environ.get("GCP_LOCATION", "us-central1")
                client = genai.Client(
                    vertexai=True,
                    project=project,
                    location=location,
                    http_options=types.HttpOptions(timeout=30_000)
                )
            else:
                api_key = get_gemini_api_key()
                client = genai.Client(
                    api_key=api_key,
                    http_options=types.HttpOptions(timeout=30_000)
                )
                
            config_params: Dict[str, Any] = {
                "temperature": temperature,
            }
            if system_instruction:
                config_params["system_instruction"] = system_instruction
            if use_search:
                config_params["tools"] = [types.Tool(google_search=types.GoogleSearch())]
            if response_schema:
                config_params["response_mime_type"] = "application/json"
                config_params["response_schema"] = response_schema
                
            config = types.GenerateContentConfig(**config_params)
            response = client.models.generate_content(
                model=model_name,
                contents=prompt,
                config=config
            )
            return response.text
        except Exception as e:
            logger.error(f"Error calling google-genai SDK: {e}")
            raise e
            
    elif HAS_LEGACY_SDK:
        try:
            api_key = get_gemini_api_key()
            legacy_genai.configure(api_key=api_key)
            generation_config: Dict[str, Any] = {
                "temperature": temperature,
            }
            tools = None
            if use_search:
                tools = [{"google_search_retrieval": {}}]
            if response_schema:
                generation_config["response_mime_type"] = "application/json"
                generation_config["response_schema"] = response_schema
                
            model = legacy_genai.GenerativeModel(
                model_name=model_name,
                generation_config=generation_config,
                system_instruction=system_instruction,
                tools=tools
            )
            response = model.generate_content(prompt)
            return response.text
        except Exception as e:
            logger.error(f"Error calling google-generativeai legacy SDK: {e}")
            raise e
    else:
        raise RuntimeError("No Gemini SDK libraries are installed. Please run pip install -r requirements.txt")


def call_gemini(
    prompt: str,
    system_instruction: Optional[str] = None,
    use_search: bool = False,
    response_schema: Optional[Type[BaseModel]] = None,
    temperature: float = 0.2,
    progress_queue: Any = None,
    cancel_event: Any = None
) -> str:
    """
    Sends a request to Google Gemini API with automatic rate limit retries (429).
    Falls back to disabling search grounding if search quota is exhausted.
    Uses exponential backoff for resilience.
    """
    import time
    max_retries = 3  # Cap retries at 3 to fail fast as requested by user
    base_delay = 5.0  # Faster retry wait
    
    current_use_search = use_search
    
    for attempt in range(max_retries):
        if cancel_event and cancel_event.is_set():
            raise RuntimeError("Operation cancelled by user.")
        try:
            return _call_gemini_api(prompt, system_instruction, current_use_search, response_schema, temperature)
        except Exception as e:
            err_msg = str(e).lower()
            if "429" in err_msg or "503" in err_msg or "resource_exhausted" in err_msg or "quota" in err_msg or "unavailable" in err_msg or "timeout" in err_msg or "deadline" in err_msg or "time out" in err_msg:
                # If daily free tier quota is hit, do not retry (it won't reset for 24 hours)
                if "perday" in err_msg or "daily" in err_msg or "free_tier_requests" in err_msg:
                    logger.error("Daily Gemini API free-tier quota limit reached. Cannot retry.")
                    raise RuntimeError("Gemini API daily free-tier limit reached (20 requests/day). Please deploy to GCP Vertex AI to use enterprise limits.")
                
                # If we were using search and failed, retry immediately without search
                if current_use_search:
                    logger.warning("Search grounding request failed due to rate limits or availability. Falling back to standard generation without search...")
                    current_use_search = False
                    time.sleep(2.0)
                else:
                    delay = base_delay * (2 ** (attempt - 1 if attempt > 0 else 0))
                    msg = f"Gemini API limit or timeout hit. Retrying in {delay:.1f}s (Attempt {attempt+1}/{max_retries})..."
                    logger.warning(msg)
                    if progress_queue:
                        progress_queue.put(msg)
                    time.sleep(delay)
            else:
                raise e
                
    # Final try
    return _call_gemini_api(prompt, system_instruction, current_use_search, response_schema, temperature)

