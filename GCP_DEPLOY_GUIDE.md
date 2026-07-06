# LifePilot AI — Google Cloud Deployment Guide

This guide describes how to deploy the LifePilot AI multi-agent application to **Google Cloud Run** using your Google Cloud credits to completely resolve rate limits and API quota issues.

---

## Quotas and Google Cloud Credits Explained

### 1. Vertex AI Mode (Recommended)
By selecting **Vertex AI** during deployment:
- **No API Keys Needed**: The application uses GCP's IAM (Identity and Access Management) credentials. It automatically grants the standard Service Account access to Vertex AI.
- **Uses GCP Credits**: All Gemini API calls go through Vertex AI in your Google Cloud Project. Usage charges are billed directly to your GCP project billing account, consuming your active Google Cloud credits.
- **Enterprise-Grade Limits**: Rate limits are raised from 15 RPM to **300+ Requests Per Minute (RPM)**, completely eliminating `429 RESOURCE_EXHAUSTED` errors during multi-agent planning.

### 2. AI Studio Mode
By selecting **AI Studio**:
- The application uses your AI Studio `GEMINI_API_KEY`, which is stored securely in **Google Cloud Secret Manager**.
- It is still bound by your AI Studio account's plan limits (e.g. Free Tier is restricted to 15 RPM and 20 daily requests on preview models).

---

## Prerequisites

1. **Google Cloud Account**: A GCP account with billing enabled.
2. **Google Cloud SDK (`gcloud` CLI)**: Installed on your local machine.
   - [Install gcloud CLI instructions](https://cloud.google.com/sdk/docs/install)
3. **Local Shell Permissions**: A shell terminal to run the deployment script.

---

## Deployment Steps

### Step 1: Login and Authenticate
Open your terminal and authenticate the Google Cloud SDK:
```bash
gcloud auth login
```
*This will open a browser window for you to select your GCP Google account.*

### Step 2: Configure Your Active Project
Set the target Google Cloud Project where you want to deploy:
```bash
gcloud config set project YOUR_PROJECT_ID
```
*(Replace `YOUR_PROJECT_ID` with your actual GCP Project ID).*

### Step 3: Run the Deploy Script
Execute the helper deployment script in the project root:
```bash
./deploy.sh
```

During execution, the script will:
1. Enable the Cloud Run, Cloud Build, Secret Manager, and Vertex AI APIs.
2. Prompt you to select the Gemini backend mode (**Vertex AI** is choice `1`).
3. Build the container using Cloud Build and deploy it to a serverless Cloud Run instance.
4. (For Vertex AI mode) Bind the appropriate IAM role (`roles/aiplatform.user`) to the container's service account.

### Step 4: Access the Live App
Once the script completes, it will output a secure HTTPS URL for your application, for example:
`https://lifepilot-ai-xxxxxx.a.run.app`

Open this link in your browser to start using LifePilot AI in the cloud!
