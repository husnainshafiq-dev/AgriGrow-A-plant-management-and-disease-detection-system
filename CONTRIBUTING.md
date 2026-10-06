# Contributing to AgriGrow

Thank you for your interest in contributing to **AgriGrow** — an AI-powered Plant Disease Diagnosis and Precision Farm Management System.

---

## 🛠️ Development Workflow

### 1. Prerequisites
- **Node.js**: v18.0.0 or higher
- **Python**: v3.10 or higher
- **MongoDB**: Community Server v6.0+ (running locally on port 27017 or MongoDB Atlas connection URI)
- **Git**

### 2. Fork & Clone
```bash
git clone https://github.com/husnainshafiq-dev/AgriGrow-A-plant-management-and-disease-detection-system.git
cd AgriGrow-A-plant-management-and-disease-detection-system
```

### 3. Install Dependencies
```bash
# Install root orchestration tools
npm install

# Install client and server packages
npm run install-all
```

### 4. Configure Environment
```bash
# Server configuration
cp server/.env.example server/.env

# Client configuration (if needed)
cp client/.env.example client/.env
```

### 5. Running the Application
```bash
# Start backend server & frontend client concurrently
npm run dev

# (Optional) Start with Python ML service included
npm run dev:full
```

---

## 🌿 Git Branching & Commit Conventions

### Branch Naming
- `feature/feature-name` — for new features
- `fix/bug-description` — for bug fixes
- `refactor/component-name` — for code improvements
- `docs/topic-name` — for documentation updates

### Commit Messages
We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:
- `feat(scope): add new capability`
- `fix(scope): resolve bug or issue`
- `refactor(scope): optimize code structure without changing behavior`
- `docs(scope): update documentation or guides`
- `test(scope): add or update unit/integration tests`
- `chore(scope): build script or dependency updates`

---

## 🧪 Testing Before Submitting PR
Ensure your changes pass builds and tests:

```bash
# Test client build
cd client
npm run build

# Run server unit & integration tests
cd ../server
npm test
```

---

## 📜 Code of Conduct
Please ensure a respectful, collaborative, and constructive environment for everyone.
