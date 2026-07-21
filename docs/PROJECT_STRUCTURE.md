# 🌾 AgriGrow — Farm Management Web App

## Project Repository Structure

```
farm-management-app/
│
├── 📂 client/                    # React Frontend (Vite)
│   ├── public/                   # Static assets (favicon, manifest, etc.)
│   ├── src/
│   │   ├── assets/               # Images, icons, fonts
│   │   ├── components/           # Reusable UI components
│   │   │   ├── common/           # Shared components (Button, Modal, Loader, etc.)
│   │   │   ├── layout/           # Layout components (Navbar, Sidebar, Footer)
│   │   │   ├── disease/          # Disease detection components
│   │   │   ├── advisory/         # AI advisory components
│   │   │   ├── mapping/          # Farm land mapping components
│   │   │   └── cost/             # Crop cost estimation components
│   │   ├── pages/                # Page-level components (one per route)
│   │   │   ├── Home.jsx
│   │   │   ├── DiseaseDetection.jsx
│   │   │   ├── AIAdvisory.jsx
│   │   │   ├── FarmMapping.jsx
│   │   │   ├── CostEstimation.jsx
│   │   │   ├── Dashboard.jsx
│   │   │   ├── Login.jsx
│   │   │   └── Register.jsx
│   │   ├── hooks/                # Custom React hooks
│   │   ├── context/              # React context providers (Auth, Theme, etc.)
│   │   ├── services/             # API call functions (Axios instances)
│   │   ├── utils/                # Helper/utility functions
│   │   ├── styles/               # Global CSS / theme files
│   │   ├── App.jsx               # Root component with routing
│   │   └── main.jsx              # React entry point
│   ├── index.html                # HTML shell
│   ├── vite.config.js            # Vite configuration
│   ├── package.json
│   └── .env                      # Frontend env vars (VITE_API_URL, etc.)
│
├── 📂 server/                    # Node.js + Express Backend
│   ├── config/                   # Configuration files
│   │   ├── db.js                 # MongoDB connection logic
│   │   ├── env.js                # Environment variable validation
│   │   └── cors.js               # CORS configuration
│   ├── controllers/              # Route handler logic (business logic)
│   │   ├── authController.js
│   │   ├── diseaseController.js
│   │   ├── advisoryController.js
│   │   ├── farmController.js
│   │   └── costController.js
│   ├── middleware/                # Express middleware
│   │   ├── auth.js               # JWT authentication middleware
│   │   ├── errorHandler.js       # Global error handling middleware
│   │   ├── validate.js           # Request validation middleware
│   │   └── upload.js             # Multer file upload middleware
│   ├── models/                   # Mongoose schemas / models
│   │   ├── User.js
│   │   ├── Farm.js
│   │   ├── Crop.js
│   │   ├── Disease.js
│   │   └── Advisory.js
│   ├── routes/                   # Express route definitions
│   │   ├── authRoutes.js
│   │   ├── diseaseRoutes.js
│   │   ├── advisoryRoutes.js
│   │   ├── farmRoutes.js
│   │   └── costRoutes.js
│   ├── services/                 # Business logic & external API integrations
│   │   ├── geminiService.js      # Gemini AI API integration
│   │   ├── mlService.js          # Communication with Python ML service
│   │   └── costService.js        # Cost calculation logic
│   ├── utils/                    # Utility/helper functions
│   │   ├── logger.js             # Winston/Morgan logging setup
│   │   ├── apiResponse.js        # Standardized API response format
│   │   └── constants.js          # App-wide constants
│   ├── uploads/                  # Temporary uploaded files (gitignored)
│   ├── server.js                 # Express app entry point
│   ├── package.json
│   └── .env                      # Backend env vars (MONGO_URI, JWT_SECRET, etc.)
│
├── 📂 ml-service/                # Python ML Microservice
│   ├── models/                   # Trained ML model files (.h5, .pkl, etc.)
│   │   └── plant_disease_model.h5
│   ├── app.py                    # FastAPI/Flask entry point
│   ├── predict.py                # Prediction logic (inference)
│   ├── preprocess.py             # Image preprocessing utilities
│   ├── config.py                 # ML service configuration
│   ├── class_names.py            # Disease class labels & display names
│   ├── requirements.txt          # Python dependencies
│   ├── Dockerfile                # Container config for ML service
│   └── .env                      # ML service env vars
│
├── 📂 docs/                      # Project documentation
│   ├── PROJECT_STRUCTURE.md      # ← You are reading this file
│   ├── API_REFERENCE.md          # API endpoint documentation
│   ├── SETUP_GUIDE.md            # Development environment setup guide
│   ├── DEPLOYMENT.md             # Deployment instructions
│   └── ARCHITECTURE.md           # System architecture diagrams & decisions
│
├── 📂 scripts/                   # Automation & utility scripts
│   ├── seed-db.js                # Seed MongoDB with sample data
│   └── setup.sh                  # One-command project setup script
│
├── .gitignore                    # Git ignore rules
├── .env.example                  # Template for environment variables
├── package.json                  # Root package.json (monorepo scripts)
├── docker-compose.yml            # Multi-container Docker setup
└── README.md                     # Project overview & quick start
```

---

## 📁 Folder Purposes Explained

### `client/` — React Frontend
> **Purpose:** Houses the entire user-facing web application.

| Subfolder         | What Goes Here |
|---|---|
| `components/`     | Reusable UI building blocks, organized by feature domain |
| `pages/`          | Full-page components, one per route (maps to React Router) |
| `hooks/`          | Custom React hooks (`useAuth`, `useFetch`, `useDebounce`, etc.) |
| `context/`        | React Context providers for global state (auth, theme, notifications) |
| `services/`       | Axios API call wrappers — every backend endpoint has a function here |
| `utils/`          | Pure helper functions (date formatting, validators, etc.) |
| `styles/`         | Global CSS, CSS modules, or theme tokens |

---

### `server/` — Node.js + Express Backend
> **Purpose:** RESTful API server that handles authentication, data management, and orchestrates communication between the frontend, database, ML service, and Gemini AI.

| Subfolder         | What Goes Here |
|---|---|
| `config/`         | Database connection, environment validation, CORS setup |
| `controllers/`    | Business logic for each route — receive request, process, send response |
| `middleware/`     | Express middleware: auth checks, error handling, file uploads |
| `models/`         | Mongoose schemas defining the shape of data in MongoDB |
| `routes/`         | Route definitions that map URLs → controllers |
| `services/`       | Integration layer: talks to Gemini API, ML microservice, cost calculators |
| `utils/`          | Logging, standardized responses, constants |

---

### `ml-service/` — Python ML Microservice
> **Purpose:** Isolated Python service that loads the trained TensorFlow model and exposes a prediction API. Keeping ML in a separate service means you can scale, update, or replace the model independently of the Node.js backend.

| File/Folder        | What Goes Here |
|---|---|
| `models/`          | The trained `.h5` model file(s) |
| `app.py`           | FastAPI/Flask app entry point with `/predict` endpoint |
| `predict.py`       | Core inference logic — loads model, preprocesses image, returns prediction |
| `preprocess.py`    | Image resizing, normalization, augmentation utilities |
| `class_names.py`   | Maps model output indices to human-readable disease names |
| `requirements.txt` | Pinned Python dependencies for reproducibility |
| `Dockerfile`       | Containerization for consistent deployment |

---

### `docs/` — Documentation
> **Purpose:** All project documentation lives here. This makes onboarding new developers fast and keeps knowledge organized.

---

### `scripts/` — Automation Scripts
> **Purpose:** Utility scripts for common development tasks — seeding the database, running setup, generating test data, etc.

---

## 🏗️ Architecture Overview

```
┌─────────────┐     HTTP      ┌─────────────────┐     HTTP      ┌─────────────────┐
│   React     │ ◄──────────► │   Node.js +     │ ◄──────────► │   Python ML     │
│   Frontend  │   REST API   │   Express API   │   Internal   │   Microservice  │
│   (Vite)    │              │                 │     API      │   (FastAPI)     │
└─────────────┘              └────────┬────────┘              └─────────────────┘
                                      │
                              ┌───────┴───────┐
                              │               │
                         ┌────▼────┐    ┌─────▼─────┐
                         │ MongoDB │    │ Gemini    │
                         │         │    │ AI API    │
                         └─────────┘    └───────────┘
```

---

## 🎯 Key Design Principles

1. **Separation of Concerns** — Each folder has one job. Controllers don't know about database internals; models don't know about HTTP.
2. **Feature-Based Organization** — Components and routes are grouped by domain (disease, advisory, farm, cost), not by file type.
3. **Microservice Architecture** — The ML model runs as an independent service. This means you can:
   - Restart the ML service without affecting the API
   - Scale the ML service independently (it's CPU/GPU intensive)
   - Swap models without touching backend code
4. **Environment Isolation** — Each service has its own `.env` file. Secrets never leak between services.
5. **Documentation First** — The `docs/` folder ensures every developer can onboard quickly.
