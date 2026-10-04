# 🌾 AgriGrow — AI-Powered Farm Management

> A full-stack MERN application for modern farm management featuring AI-powered plant disease detection, smart farming advisory, farm land mapping, and crop cost estimation.

---

## 🚀 Quick Start

### Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| **Node.js** | ≥ 18.x | Backend & Frontend runtime |
| **MongoDB** | ≥ 6.x | Database |
| **Python** | ≥ 3.9 | ML microservice |
| **npm** | ≥ 9.x | Package manager |

### 1. Clone & Install

```bash
# Clone the repository
git clone https://github.com/yourusername/agrigrow.git
cd agrigrow

# Install all dependencies (root + server + client)
npm run install-all
```

### 2. Environment Setup

```bash
# Copy the template
cp .env.example server/.env

# Edit with your actual values:
# - MONGO_URI
# - JWT_SECRET (generate a strong random string)
# - GEMINI_API_KEY (from Google AI Studio)
```

#### Using the Gemini API for disease search

When a disease is detected, the app can fetch an **AI treatment and prevention guide** (organic/chemical options, costs in ₹, prevention tips) from Google Gemini. To enable it:

1. Get an API key from [Google AI Studio](https://aistudio.google.com/app/apikey) (free tier available).
2. Add to `server/.env`:
   ```bash
   GEMINI_API_KEY=your_key_here
   ```
3. Restart the API server. After you **Analyse** a leaf and a disease is detected, the **"AI treatment & prevention guide"** section will appear with Gemini’s response. If the key is missing or invalid, you’ll still see the basic description and recommendation from the ML model.

**If you see "AI-Powered Advisory Temporarily Unavailable"** — the app is using the fallback (basic guidance). Check the **server logs** for the exact Gemini error:
- **HTTP 403** — Invalid API key. Get a new key from [Google AI Studio](https://aistudio.google.com/app/apikey) and set `GEMINI_API_KEY` in `server/.env`.
- **HTTP 404** — Model not found. The default is `gemini-2.0-flash`. Override with `GEMINI_MODEL=gemini-2.5-flash` (or another [available model](https://ai.google.dev/api/models)) in `server/.env`.
- **HTTP 429** — Quota exceeded (free tier limit). Wait a few minutes, or check [Gemini API rate limits](https://ai.google.dev/gemini-api/docs/rate-limits). You can run `node server/scripts/test-gemini.js` from the project root to test the API.

### 3. Start MongoDB

```bash
# If using local MongoDB
mongod

# Or use MongoDB Atlas (cloud) — just update MONGO_URI
```

### 4. Seed the Database (Optional)

```bash
npm run seed
```

Demo credentials:
- **Email:** demo@agrigrow.com
- **Password:** password123

### 5. Start Development Servers

```bash
# Start both backend + frontend concurrently
npm run dev
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:5000 |
| ML Service | http://localhost:8000 |

---

## 🏗️ Architecture

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

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🦠 **Disease Detection** | Upload leaf images → AI identifies diseases with confidence scores |
| 🤖 **AI Advisory** | Ask Gemini AI farming questions with context-aware responses |
| 🗺️ **Farm Mapping** | Draw farm boundaries on a map, calculate area |
| 💰 **Cost Estimation** | Estimate crop production costs and projected ROI |
| 🔐 **Authentication** | JWT-based auth with role-based access control |
| 📊 **Dashboard** | Overview of farms, crops, detection history, and costs |

---

## 📁 Project Structure

See [docs/PROJECT_STRUCTURE.md](docs/PROJECT_STRUCTURE.md) for a detailed breakdown.

---

## 📡 API Endpoints

See [docs/API_REFERENCE.md](docs/API_REFERENCE.md) for full documentation.

### Quick Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login |
| GET | `/api/auth/me` | Get profile |
| POST | `/api/disease/detect` | Detect disease (upload image) |
| GET | `/api/disease/history` | Detection history |
| POST | `/api/advisory/ask` | Ask AI advisory |
| GET | `/api/farms` | List farms |
| POST | `/api/farms` | Create farm |
| POST | `/api/cost/estimate` | Estimate costs |
| GET | `/api/health` | Health check |

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, React Router |
| Backend | Node.js, Express.js |
| Database | MongoDB, Mongoose |
| ML Service | Python, TensorFlow/Keras, FastAPI |
| AI | Google Gemini API |
| Auth | JWT, bcrypt |
| Security | Helmet, CORS, Rate Limiting, Mongo Sanitize |

---

## 📝 Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start both servers (backend + frontend) |
| `npm run server` | Start backend only |
| `npm run client` | Start frontend only |
| `npm run build` | Build frontend for production |
| `npm run seed` | Seed database with sample data |
| `npm run install-all` | Install all dependencies |

---

## 🤝 Contributing

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m "Add amazing feature"`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License.
