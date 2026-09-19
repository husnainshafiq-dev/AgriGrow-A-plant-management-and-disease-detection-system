# 🌾 AgriGrow — Farm Management Web App

## Project Repository Structure

```
agrigrow/
│
├── 📂 client/                        # React Frontend (Vite)
│   ├── public/                       # Static assets served as-is
│   │   ├── icon-192.png              # PWA icon (192×192)
│   │   ├── icon-512.png              # PWA icon (512×512)
│   │   ├── icon.svg                  # SVG favicon
│   │   ├── test_model.html           # Standalone TF.js model test page
│   │   ├── model/                    # TensorFlow.js model (legacy copy)
│   │   │   ├── model.json            # TF.js graph-model topology
│   │   │   ├── group1-shard1of1.bin  # Model weights (binary shard)
│   │   │   ├── class_names.json      # 48 disease class labels
│   │   │   └── README.json           # Model metadata
│   │   └── models/                   # TensorFlow.js model (primary)
│   │       └── plant-disease/
│   │           ├── model.json
│   │           ├── group1-shard1of1.bin
│   │           ├── class_names.json
│   │           └── model_metadata.json
│   ├── src/
│   │   ├── components/               # Reusable UI components
│   │   │   ├── BookmarkButton.jsx    # Toggle bookmark on any entity
│   │   │   ├── EventModal.jsx        # Calendar event create/edit modal
│   │   │   ├── Footer.jsx            # App footer
│   │   │   ├── LanguageSwitcher.jsx  # i18n language dropdown
│   │   │   ├── Navbar.jsx            # Top navigation bar
│   │   │   ├── Navbar.css
│   │   │   ├── PriceChart.jsx        # Market price trend chart
│   │   │   ├── ProtectedRoute.jsx    # Auth-guarded route wrapper
│   │   │   └── WeatherAlertBadge.jsx # Navbar weather alert indicator
│   │   ├── pages/                    # Page-level components (one per route)
│   │   │   ├── Home.jsx              # Landing / hero page
│   │   │   ├── Login.jsx             # Login form
│   │   │   ├── Login.css
│   │   │   ├── Register.jsx          # Registration form
│   │   │   ├── Register.css
│   │   │   ├── Profile.jsx           # User profile & settings
│   │   │   ├── Profile.css
│   │   │   ├── AdminDashboard.jsx    # Admin panel (user mgmt, stats)
│   │   │   ├── AdminDashboard.css
│   │   │   ├── Bookmarks.jsx         # Saved bookmarks list
│   │   │   ├── Bookmarks.css
│   │   │   ├── CropCalendar.jsx      # Farming event calendar
│   │   │   ├── CropCalendar.css
│   │   │   ├── ExpertQA.jsx          # Expert Q&A forum page
│   │   │   ├── ExpertQA.css
│   │   │   ├── MarketPrices.jsx      # Live crop market prices
│   │   │   ├── MarketPrices.css
│   │   │   ├── WeatherAlerts.jsx     # Weather alerts dashboard
│   │   │   ├── WeatherAlerts.css
│   │   │   └── __tests__/
│   │   │       └── MarketPrices.test.jsx
│   │   ├── context/                  # React context providers
│   │   │   ├── AuthContext.jsx       # Authentication state & JWT handling
│   │   │   ├── BookmarkContext.jsx   # Bookmark state management
│   │   │   └── LanguageContext.jsx   # i18n language state
│   │   ├── i18n/                     # Internationalization translations
│   │   │   ├── en.json               # English
│   │   │   ├── ur.json               # Urdu
│   │   │   └── pa.json               # Punjabi
│   │   ├── App.jsx                   # Root component with routing
│   │   ├── App.css                   # Global app styles
│   │   ├── main.jsx                  # React entry point (ReactDOM.createRoot)
│   │   ├── index.css                 # Base CSS reset & variables
│   │   ├── Dashboard.jsx             # Main farmer dashboard
│   │   ├── Dashboard.css
│   │   ├── FarmMap.jsx               # Farm boundary mapping (Leaflet)
│   │   ├── FarmMap.css
│   │   ├── PrecisionMap.jsx          # Precision agriculture map view
│   │   ├── PrecisionMap.css
│   │   ├── Community.jsx             # Community forum / blog feed
│   │   ├── Community.css
│   │   ├── offlineModel.js           # Offline TF.js model inference logic
│   │   ├── offlineModelMeta.js       # Model metadata constants
│   │   ├── offlineStorage.js         # IndexedDB offline data persistence
│   │   ├── offlineInstaller.js       # Service worker / offline install logic
│   │   ├── offlineDownload.css       # Offline download UI styles
│   │   └── setupTests.js             # Test setup (Vitest/Jest)
│   ├── index.html                    # HTML shell
│   ├── vite.config.js                # Vite configuration (proxy, PWA, etc.)
│   ├── package.json
│   └── .env                          # Frontend env vars (VITE_API_URL)
│
├── 📂 server/                        # Node.js + Express Backend
│   ├── config/                       # Configuration files
│   │   ├── db.js                     # MongoDB connection (Mongoose)
│   │   ├── env.js                    # Environment variable validation & export
│   │   └── cors.js                   # CORS allowed origins configuration
│   ├── controllers/                  # Route handler logic (business logic)
│   │   ├── authController.js         # Register, login, profile, password
│   │   ├── diseaseController.js      # Disease detection (upload → ML → result)
│   │   ├── advisoryController.js     # AI farming advisory (Gemini integration)
│   │   ├── farmController.js         # Farm CRUD, geo boundaries
│   │   ├── costController.js         # Crop cost estimation & ROI
│   │   ├── dashboardController.js    # Dashboard aggregation & stats
│   │   ├── blogController.js         # Blog post CRUD
│   │   ├── forumController.js        # Community forum threads & replies
│   │   ├── adminController.js        # Admin-only user management
│   │   ├── suitabilityController.js  # Soil-crop suitability analysis
│   │   ├── calendarController.js     # Crop calendar events CRUD
│   │   ├── marketPriceController.js  # Market price data & trends
│   │   ├── questionController.js     # Expert Q&A questions & answers
│   │   ├── bookmarkController.js     # Bookmark toggle & listing
│   │   └── weatherAlertController.js # Weather alert fetch & display
│   ├── middleware/                    # Express middleware
│   │   ├── auth.js                   # JWT authentication & role-based access
│   │   ├── errorHandler.js           # Global error handling (AppError class)
│   │   ├── validate.js               # Joi schema validation middleware
│   │   └── upload.js                 # Multer file upload (images, size limits)
│   ├── models/                       # Mongoose schemas / models (14 collections)
│   │   ├── User.js                   # User accounts, auth, preferences
│   │   ├── Farm.js                   # Farm profiles, boundaries, metadata
│   │   ├── Crop.js                   # Crop records linked to farms
│   │   ├── Disease.js                # Disease detection reports & history
│   │   ├── Advisory.js               # AI advisory conversation logs
│   │   ├── CostEstimation.js         # Cost estimation records
│   │   ├── GeoField.js               # Geospatial field boundaries (GeoJSON)
│   │   ├── BlogPost.js               # Community blog posts
│   │   ├── Forum.js                  # Forum threads & replies
│   │   ├── CropCalendar.js           # Calendar events (planting, harvest, etc.)
│   │   ├── MarketPrice.js            # Scraped market price records
│   │   ├── Notification.js           # User notifications
│   │   ├── Question.js               # Expert Q&A entries
│   │   └── WeatherAlert.js           # Weather alert records
│   ├── routes/                       # Express route definitions (URL → controller)
│   │   ├── authRoutes.js             # /api/auth/*
│   │   ├── diseaseRoutes.js          # /api/disease/*
│   │   ├── advisoryRoutes.js         # /api/advisory/*
│   │   ├── farmRoutes.js             # /api/farms/*
│   │   ├── costRoutes.js             # /api/cost/*
│   │   ├── dashboardRoutes.js        # /api/dashboard/*
│   │   ├── blogRoutes.js             # /api/blog/*
│   │   ├── forumRoutes.js            # /api/forum/*
│   │   ├── adminRoutes.js            # /api/admin/*
│   │   ├── suitabilityRoutes.js      # /api/suitability/*
│   │   ├── calendarRoutes.js         # /api/calendar/*
│   │   ├── marketPriceRoutes.js      # /api/market/*
│   │   ├── questionRoutes.js         # /api/questions/*
│   │   ├── bookmarkRoutes.js         # /api/bookmarks/*
│   │   └── weatherAlertRoutes.js     # /api/weather/*
│   ├── services/                     # Business logic & external API integrations
│   │   ├── geminiService.js          # Google Gemini AI API integration
│   │   ├── mlService.js              # Communication with Python ML service
│   │   ├── costService.js            # Cost calculation engine
│   │   ├── dashboardService.js       # Dashboard data aggregation
│   │   ├── suitabilityService.js     # Soil-crop suitability matching
│   │   ├── marketPriceScraper.js     # Web scraper for crop market prices
│   │   └── weatherAlertService.js    # OpenWeatherMap API integration
│   ├── validators/                   # Joi request validation schemas
│   │   ├── authSchemas.js            # Login/register input validation
│   │   └── farmSchemas.js            # Farm creation/update validation
│   ├── utils/                        # Utility / helper functions
│   │   ├── logger.js                 # Winston logging setup
│   │   ├── apiResponse.js            # Standardized API response format
│   │   ├── constants.js              # App-wide constants & enums
│   │   ├── geoUtils.js               # Geospatial calculation utilities
│   │   └── slug.js                   # URL slug generation
│   ├── jobs/                         # Scheduled background jobs
│   │   └── marketPriceCron.js        # Daily market price scraping cron
│   ├── scripts/                      # Development utility scripts
│   │   ├── seed-db.js                # Seed MongoDB with demo data
│   │   ├── test-gemini.js            # Test Gemini API connectivity
│   │   └── list-gemini-models.js     # List available Gemini models
│   ├── tests/                        # Backend tests
│   │   └── marketPrice.test.js       # Market price endpoint tests
│   ├── uploads/                      # Uploaded files (gitignored)
│   ├── logs/                         # Application log files (gitignored)
│   ├── server.js                     # Express app entry point
│   ├── package.json
│   └── .env                          # Backend env vars (MONGO_URI, JWT_SECRET, etc.)
│
├── 📂 ml-service/                    # Python ML Microservice (FastAPI + TensorFlow)
│   ├── app.py                        # FastAPI app — /predict, /health endpoints,
│   │                                 #   disease info DB, preprocessing & inference
│   ├── requirements.txt              # Pinned Python dependencies
│   ├── test_ml_load.py               # Test script — model loading verification
│   └── test_normalization.py         # Test script — image preprocessing validation
│
├── 📂 model/                         # Trained ML model files
│   ├── class_names.json              # 15 disease class labels (ground truth)
│   ├── plant_disease_model_v2.keras  # Keras model (primary, ~25 MB)
│   ├── plant_disease_model_v2_clean.h5       # HDF5 model (cleaned)
│   ├── plant_disease_model_v2_legacy.h5      # HDF5 model (legacy format)
│   ├── plant_disease_model_v2_sequential.h5  # HDF5 model (sequential)
│   ├── saved_model_v2/               # TensorFlow SavedModel directory
│   └── tfjs_model.zip                # TF.js model export (zipped)
│
├── 📂 scripts/                       # ML training & data scripts
│   ├── train_colab.py                # Google Colab training script
│   └── merge_datasets.py             # Dataset merging utility
│
├── 📂 downloads/                     # Downloaded model artifacts
│   ├── best_mobilenet_v2.pth         # PyTorch MobileNetV2 weights
│   ├── mobilenet_v2.onnx             # ONNX model export
│   ├── tfjs_mobilenet_model.zip      # TF.js MobileNet export (zipped)
│   ├── extracted_tfjs/               # Extracted TF.js model files
│   └── latest-model/                 # Latest model version
│
├── 📂 docs/                          # Project documentation
│   ├── PROJECT_STRUCTURE.md          # ← You are reading this file
│   ├── API_REFERENCE.md              # API endpoint documentation
│   ├── DATABASE_DESIGN.md            # MongoDB schema design & ERD
│   ├── GEMINI_AI_GUIDE.md            # Gemini AI integration guide
│   ├── IMAGE_UPLOAD_ML_GUIDE.md      # Disease detection pipeline guide
│   ├── FARM_MAPPING_GUIDE.md         # Farm mapping & GIS features guide
│   └── APP_FREEZE_SOLUTION.md        # Debugging guide for app freeze issues
│
├── .venv/                            # Python virtual environment (gitignored)
├── plant_disease_model.h5            # Root-level model copy (legacy)
├── predict_server.py                 # Standalone prediction server (legacy)
├── server.js                         # Root-level server entry (legacy)
├── .gitignore                        # Git ignore rules
├── .env.example                      # Template for environment variables
├── package.json                      # Root package.json (monorepo scripts)
└── README.md                         # Project overview & quick start
```

---

## 📁 Folder Purposes Explained

### `client/` — React Frontend
> **Purpose:** Houses the entire user-facing Progressive Web Application built with React 18 + Vite.

| Subfolder         | What Goes Here |
|---|---|
| `components/`     | Reusable UI building blocks — Navbar, Footer, ProtectedRoute, modals, charts |
| `pages/`          | Full-page components, one per route — Login, Register, Dashboard, Admin, etc. |
| `context/`        | React Context providers for global state (AuthContext, BookmarkContext, LanguageContext) |
| `i18n/`           | Translation JSON files for multilingual support (English, Urdu, Punjabi) |
| `public/model/`   | TensorFlow.js model files for **offline** browser-based disease detection |
| `public/models/`  | Primary TF.js model with metadata for offline inference |

> **Note:** Several major pages (Dashboard, FarmMap, PrecisionMap, Community) live directly in `src/` rather than `src/pages/` along with their CSS files and offline support modules.

---

### `server/` — Node.js + Express Backend
> **Purpose:** RESTful API server that handles authentication, data management, and orchestrates communication between the frontend, database, ML service, and Gemini AI.

| Subfolder         | What Goes Here |
|---|---|
| `config/`         | Database connection, environment validation, CORS setup |
| `controllers/`    | Business logic for each route — receive request, process, send response (15 controllers) |
| `middleware/`     | Express middleware: JWT auth, error handling, Joi validation, Multer file uploads |
| `models/`         | Mongoose schemas defining the shape of data in MongoDB (14 collections) |
| `routes/`         | Route definitions that map URLs → controllers (15 route files) |
| `services/`       | Integration layer: Gemini AI, ML microservice, cost calculators, weather, market scraper |
| `validators/`     | Joi validation schemas for request body/params (auth, farm) |
| `utils/`          | Logging (Winston), standardized responses, constants, geospatial math, slug generation |
| `jobs/`           | Scheduled background tasks (daily market price scraping cron) |
| `scripts/`        | Dev utility scripts: seed database, test Gemini API, list models |
| `tests/`          | Backend test files |

---

### `ml-service/` — Python ML Microservice
> **Purpose:** Isolated Python service (FastAPI + Uvicorn) that loads the trained TensorFlow/Keras model and exposes a prediction API. Keeping ML in a separate service means you can scale, update, or replace the model independently of the Node.js backend.

| File               | What It Does |
|---|---|
| `app.py`           | FastAPI app with `/predict` and `/health` endpoints, disease info database, image preprocessing, and inference — all in one file |
| `requirements.txt` | Pinned Python dependencies (TensorFlow, FastAPI, Pillow, etc.) |
| `test_ml_load.py`  | Verifies model loads correctly |
| `test_normalization.py` | Validates image preprocessing pipeline |

---

### `model/` — Trained Model Files
> **Purpose:** Stores all versions of the trained plant disease detection model in various formats (Keras, HDF5, SavedModel, TF.js).

---

### `scripts/` — ML Training Scripts
> **Purpose:** Python scripts for model training (Google Colab) and dataset preparation.

---

### `docs/` — Documentation
> **Purpose:** All project documentation lives here. Each guide covers a specific subsystem in depth.

| File | Covers |
|---|---|
| `PROJECT_STRUCTURE.md` | This file — project layout and architecture |
| `API_REFERENCE.md` | All REST API endpoints with request/response examples |
| `DATABASE_DESIGN.md` | MongoDB collections, schemas, ERD, and data dictionary |
| `GEMINI_AI_GUIDE.md` | How the Gemini AI advisory integration works |
| `IMAGE_UPLOAD_ML_GUIDE.md` | End-to-end disease detection pipeline (upload → ML → result) |
| `FARM_MAPPING_GUIDE.md` | Farm boundary mapping, GIS, soil-crop suitability |
| `APP_FREEZE_SOLUTION.md` | Debugging guide for app freeze and performance issues |

---

## 🏗️ Architecture Overview

```
┌─────────────┐     HTTP      ┌─────────────────┐     HTTP      ┌─────────────────┐
│   React     │ ◄──────────► │   Node.js +     │ ◄──────────► │   Python ML     │
│   Frontend  │   REST API   │   Express API   │   Internal   │   Microservice  │
│   (Vite)    │              │                 │     API      │   (FastAPI)     │
└──────┬──────┘              └────────┬────────┘              └─────────────────┘
       │                              │
       │ (offline fallback)    ┌──────┴──────┬───────────────┐
       │                       │             │               │
  ┌────▼──────────┐      ┌─────▼────┐  ┌─────▼─────┐  ┌─────▼──────────┐
  │ TensorFlow.js │      │ MongoDB  │  │ Gemini    │  │ OpenWeatherMap │
  │ (in-browser)  │      │          │  │ AI API    │  │ API            │
  └───────────────┘      └──────────┘  └───────────┘  └────────────────┘
```

---

## 🎯 Key Design Principles

1. **Separation of Concerns** — Each folder has one job. Controllers don't know about database internals; models don't know about HTTP.
2. **Feature-Based Organization** — Controllers, routes, and services are grouped by domain (disease, advisory, farm, cost, calendar, market, weather, etc.).
3. **Microservice Architecture** — The ML model runs as an independent FastAPI service. This means you can:
   - Restart the ML service without affecting the API
   - Scale the ML service independently (it's CPU/GPU intensive)
   - Swap models without touching backend code
4. **Offline-First PWA** — TensorFlow.js model files in `client/public/` enable browser-based disease detection when offline, with IndexedDB for local data persistence.
5. **Multilingual Support** — i18n translation files support English, Urdu, and Punjabi.
6. **Environment Isolation** — Each service has its own `.env` file. Secrets never leak between services.
7. **Documentation First** — The `docs/` folder ensures every developer can onboard quickly.
