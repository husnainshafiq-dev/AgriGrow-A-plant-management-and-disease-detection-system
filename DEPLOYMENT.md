# 🚀 AgriGrow — Vercel & Render Deployment Runbook

This guide walks you through deploying AgriGrow with zero friction:
* **Frontend (React 18 + Vite PWA):** Deployed on **Vercel**
* **Backend API (Node.js + Express):** Deployed on **Render**
* **ML Microservice (FastAPI + ONNX MobileNetV2):** Deployed on **Render**
* **Database (MongoDB):** Hosted on **MongoDB Atlas** (Free M0 Cluster)

---

## 📋 Pre-Deployment Checklist

1. **MongoDB Atlas Account:** A free MongoDB cluster (get your connection string: `mongodb+srv://...`).
2. **GitHub Repository:** Pushed to [husnainshafiq-dev/AgriGrow-A-plant-management-and-disease-detection-system](https://github.com/husnainshafiq-dev/AgriGrow-A-plant-management-and-disease-detection-system).
3. **Google Gemini API Key:** (Optional, for smart farming advisory).

---

## Step 1: Deploy on Render (Backend + ML Service)

Render can deploy both the API server and ML service automatically using the included `render.yaml` Blueprint, or via manual setup.

### 🌟 Option A: 1-Click Blueprint (Recommended)
1. Go to [dashboard.render.com](https://dashboard.render.com).
2. Click **New +** ➔ **Blueprint**.
3. Select your GitHub repository: `AgriGrow-A-plant-management-and-disease-detection-system`.
4. Render will read `render.yaml` and configure:
   * `agrigrow-api` (Node.js Web Service)
   * `agrigrow-ml` (Python FastAPI Web Service)
5. Fill in the prompted environment variables:
   * **`MONGO_URI`**: Your MongoDB Atlas connection URI.
   * **`GEMINI_API_KEY`**: Your Google Gemini API Key (optional).
   * **`CLIENT_URL`**: Leave blank for now, or put your Vercel URL once created.
6. Click **Apply**.
7. Once deployed, copy your Backend URL: `https://agrigrow-api.onrender.com`.

---

### Option B: Manual Web Service Setup on Render

If you prefer manual setup:

#### 1. Deploy the ML Microservice (`agrigrow-ml`):
* **New +** ➔ **Web Service** ➔ Connect your repo.
* **Name:** `agrigrow-ml`
* **Root Directory:** `ml-service`
* **Runtime:** `Python 3`
* **Build Command:** `pip install -r requirements.txt`
* **Start Command:** `uvicorn app:app --host 0.0.0.0 --port $PORT`
* **Health Check Path:** `/health`
* Click **Create Web Service** and copy its URL: `https://agrigrow-ml.onrender.com`.

#### 2. Deploy the Express API (`agrigrow-api`):
* **New +** ➔ **Web Service** ➔ Connect your repo.
* **Name:** `agrigrow-api`
* **Root Directory:** `server`
* **Runtime:** `Node`
* **Build Command:** `npm install`
* **Start Command:** `npm start`
* **Health Check Path:** `/api/health`
* **Environment Variables:**
  ```env
  NODE_ENV=production
  PORT=5000
  MONGO_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/agrigrow?retryWrites=true&w=majority
  JWT_SECRET=super_secret_jwt_random_key_64_characters
  JWT_EXPIRE=7d
  ML_SERVICE_URL=https://agrigrow-ml.onrender.com
  CLIENT_URL=https://your-agrigrow-app.vercel.app
  GEMINI_API_KEY=your_gemini_api_key_here
  ```
* Click **Create Web Service** and copy its URL: `https://agrigrow-api.onrender.com`.

---

## Step 2: Deploy Frontend on Vercel

1. Log into [vercel.com](https://vercel.com) and click **Add New...** ➔ **Project**.
2. Select your repository: `AgriGrow-A-plant-management-and-disease-detection-system`.
3. Configure the Project Settings:
   * **Framework Preset:** `Vite`
   * **Root Directory:** Click Edit and select **`client`** (or leave as root; the repo has `vercel.json` configured for both!).
   * **Build Command:** `npm run build`
   * **Output Directory:** `dist`
4. Expand **Environment Variables** and add:
   | Key | Value | Description |
   | :--- | :--- | :--- |
   | `VITE_API_URL` | `https://agrigrow-api.onrender.com` | Your Render backend URL (no trailing slash) |
5. Click **Deploy**.

Vercel will build the frontend and provide your live URL: `https://your-project.vercel.app`.

---

## Step 3: Connect Frontend to Backend (Final CORS Check)

1. Go back to your Render Dashboard ➔ `agrigrow-api` ➔ **Environment**.
2. Set or verify:
   ```env
   CLIENT_URL=https://your-project.vercel.app
   ```
   *(Note: The server also automatically allows all `*.vercel.app` domains by default!)*
3. Save changes. Render will perform a quick zero-downtime redeploy.

---

## 🎯 Verification

1. Open your Vercel URL in your browser: `https://your-project.vercel.app`.
2. Check the bottom status indicator: it should display **"Online detection available"**.
3. Register a test farmer account or log in.
4. Test disease diagnosis by uploading a leaf image.
5. Test offline mode: Open DevTools ➔ Network ➔ Throttling ➔ Offline. The in-browser TensorFlow.js model will still diagnose diseases offline!
