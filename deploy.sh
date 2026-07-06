#!/bin/bash
set -e

# Set default values if not provided as environment variables
PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
REGION=${GCP_REGION:-us-central1}
SERVICE_NAME="lifepilot-ai"
SECRET_NAME="GEMINI_API_KEY"

if [ -z "$PROJECT_ID" ]; then
  echo "Error: No active GCP project configured. Run 'gcloud config set project [PROJECT_ID]' first."
  exit 1
fi

echo "=========================================="
echo "Deploying LifePilot AI to Google Cloud Run"
echo "Project ID: $PROJECT_ID"
echo "Region:     $REGION"
echo "Service:    $SERVICE_NAME"
echo "=========================================="

# 1. Enable required APIs
echo "Enabling GCP Services (Cloud Run, Secret Manager, Cloud Build, Vertex AI)..."
gcloud services enable \
  run.googleapis.com \
  secretmanager.googleapis.com \
  cloudbuild.googleapis.com \
  aiplatform.googleapis.com

# 2. Choose Deployment Mode: Vertex AI or AI Studio
echo ""
echo "Choose Gemini API Backend Mode:"
echo "1) Vertex AI (Recommended - Uses GCP credits, no API key needed, high rate limits)"
echo "2) AI Studio (Uses GEMINI_API_KEY from Secret Manager)"
if [ -z "$DEPLOY_MODE" ]; then
  read -p "Select choice [1-2] (default: 1): " MODE
  MODE=${MODE:-1}
else
  MODE=$DEPLOY_MODE
fi

ENV_VARS="GCP_PROJECT=${PROJECT_ID},GCP_LOCATION=${REGION}"
SECRETS_OPT=""

if [ "$MODE" = "1" ]; then
  echo "Setting up Vertex AI integration..."
  ENV_VARS="${ENV_VARS},USE_VERTEX=true"
else
  echo "Setting up AI Studio Secret Manager integration..."
  ENV_VARS="${ENV_VARS},USE_VERTEX=false"
  
  # Setup Secret Manager secret if GEMINI_API_KEY is available locally
  if [ ! -z "$GEMINI_API_KEY" ]; then
    if ! gcloud secrets describe "$SECRET_NAME" &>/dev/null; then
      echo "Creating Secret Manager secret: $SECRET_NAME..."
      gcloud secrets create "$SECRET_NAME" --replication-policy="automatic"
      echo -n "$GEMINI_API_KEY" | gcloud secrets versions add "$SECRET_NAME" --data-file=-
      echo "Secret successfully created and seeded with local GEMINI_API_KEY."
    else
      echo "Secret Manager secret '$SECRET_NAME' already exists. Skipping creation."
    fi
  else
    echo "WARNING: Local GEMINI_API_KEY env variable is not set."
    echo "Ensure the secret '$SECRET_NAME' exists and has a valid value in GCP Secret Manager."
  fi
  SECRETS_OPT="--set-secrets=GEMINI_API_KEY=${SECRET_NAME}:latest"
fi

# 3. Build and deploy to Cloud Run
echo "Building and Deploying to Google Cloud Run..."
gcloud run deploy "$SERVICE_NAME" \
  --source . \
  --region "$REGION" \
  --allow-unauthenticated \
  --set-env-vars="$ENV_VARS" \
  $SECRETS_OPT

# 4. Grant Vertex AI permissions if using Vertex AI
if [ "$MODE" = "1" ]; then
  # Get default compute service account of the project
  PROJECT_NUM=$(gcloud projects describe "$PROJECT_ID" --format="value(projectNumber)")
  SERVICE_ACCOUNT="${PROJECT_NUM}-compute@developer.gserviceaccount.com"
  
  echo "Granting Vertex AI User role to the default service account: $SERVICE_ACCOUNT..."
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${SERVICE_ACCOUNT}" \
    --role="roles/aiplatform.user"
fi

echo "=========================================="
echo "Deployment complete. Check output above for the Service URL."
echo "=========================================="
