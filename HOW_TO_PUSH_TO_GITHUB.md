# 🚀 AgriGrow GitHub Push Guide: Complete Step-by-Step Manual

This document provides a comprehensive, practical guide on how to commit and push code to GitHub. It is tailored for the **AgriGrow** project repository, including standard commands, branching workflows, authentication setups, and troubleshooting solutions for common errors.

---

## 📋 Table of Contents
1. [Initial Setup & Configuration](#1-initial-setup--configuration)
2. [Standard Day-to-Day Push Workflow](#2-standard-day-to-day-push-workflow)
3. [Branching Workflow (Recommended for Features)](#3-branching-workflow-recommended-for-features)
4. [First-Time Repository Setup (From Scratch)](#4-first-time-repository-setup-from-scratch)
5. [GitHub Authentication (Personal Access Token & Credentials)](#5-github-authentication-personal-access-token--credentials)
6. [Multi-Remote Workflows (Origin vs Upstream)](#6-multi-remote-workflows-origin-vs-upstream)
7. [Troubleshooting & Common Errors](#7-troubleshooting--common-errors)
8. [AgriGrow Quick Cheat Sheet](#8-agrigrow-quick-cheat-sheet)

---

## 1. Initial Setup & Configuration

Before pushing code, make sure Git is installed and your identity is configured on your machine.

### Check Git Installation
Open PowerShell or your terminal and run:
```bash
git --version
```

### Configure Git Identity
Your commits need an author name and email associated with your GitHub account:
```bash
git config --global user.name "Your Name"
git config --global user.email "your-email@example.com"
```

Verify your configuration:
```bash
git config --list
```

---

## 2. Standard Day-to-Day Push Workflow

Follow these steps every time you edit code and want to save and push your changes to GitHub.

### Step 1: Check Current Status
See which files were modified, created, or deleted:
```bash
git status
```
- **Red files**: Changes not yet staged for commit.
- **Green files**: Staged changes ready to be committed.

### Step 2: Review Code Changes (Optional but Recommended)
Inspect the exact code diff before staging:
```bash
# View all changes
git diff

# View changes in a specific file
git diff client/src/Dashboard.jsx
```

### Step 3: Stage Changes
Choose what you want to include in the commit:

```bash
# Option A: Stage a specific file
git add client/src/Dashboard.jsx

# Option B: Stage multiple specific files
git add client/src/Dashboard.jsx client/src/Dashboard.css

# Option C: Stage all modified and new files in the project
git add .
```

Confirm that the files are now green (staged):
```bash
git status
```

### Step 4: Commit Changes
Create a commit with a clear, descriptive message explaining what you changed:
```bash
git commit -m "fix(dashboard): remove floating options toggle button"
```

#### Good Commit Message Conventions:
- `feat(module): add new crop health analytics card`
- `fix(module): fix mobile bottom sheet overlap issue`
- `style(module): update navbar button spacing`
- `docs(readme): add GitHub push instructions`
- `refactor(api): clean up weather forecast fetch logic`

### Step 5: Pull Latest Remote Changes (Prevent Conflicts)
Before pushing, ensure your local copy is up to date with any changes teammates or remote updates made:
```bash
git pull origin main
```

### Step 6: Push to GitHub
Send your committed code to the GitHub remote repository:
```bash
git push origin main
```

If successful, you will see output similar to:
```text
To https://github.com/husnainshafiq-dev/AgriGrow-A-plant-management-and-disease-detection-system.git
   fa95e30..bafc246  main -> main
```

---

## 3. Branching Workflow (Recommended for Features)

Working directly on `main` can risk breaking working code. For new features or fixes, use a dedicated branch.

### 1. Create and Switch to a New Branch
```bash
git checkout -b feature/weather-alerts
```

### 2. Make Changes & Stage Them
```bash
git add .
git commit -m "feat(weather): add rainfall alert notifications"
```

### 3. Push the New Branch to GitHub
```bash
git push -u origin feature/weather-alerts
```
*(The `-u` flag sets the upstream tracking so next time you can just type `git push`.)*

### 4. Create a Pull Request (PR)
1. Go to your repository on GitHub in the browser.
2. Click the **Compare & pull request** banner.
3. Review changes and click **Create pull request**.
4. Once reviewed/approved, click **Merge pull request**.

### 5. Switch Back to Main & Update
```bash
git checkout main
git pull origin main
```

---

## 4. First-Time Repository Setup (From Scratch)

If you are setting up a brand-new project or connecting a local folder to a new empty GitHub repository for the first time:

```bash
# 1. Initialize git in the project root
git init

# 2. Add all files
git add .

# 3. Create the initial commit
git commit -m "feat: initial commit for AgriGrow project"

# 4. Ensure the primary branch is named 'main'
git branch -M main

# 5. Connect the local repo to your GitHub remote repository
git remote add origin https://github.com/husnainshafiq-dev/AgriGrow-A-plant-management-and-disease-detection-system.git

# 6. Push and link branch
git push -u origin main
```

---

## 5. GitHub Authentication (Personal Access Token & Credentials)

GitHub no longer accepts account passwords when pushing via HTTPS. You must use either a **Personal Access Token (PAT)** or the **Git Credential Manager**.

### How to Generate a Personal Access Token (PAT)
1. Log in to [GitHub](https://github.com).
2. Go to **Settings** (top right profile icon) → **Developer settings** (bottom of left menu).
3. Select **Personal access tokens** → **Tokens (classic)**.
4. Click **Generate new token** → **Generate new token (classic)**.
5. Set:
   - **Note**: `AgriGrow Laptop Dev`
   - **Expiration**: 30, 60, 90 days, or No expiration
   - **Scopes**: Check `repo` (Full control of private repositories) and `workflow`.
6. Click **Generate token**.
7. **Copy the token immediately** (you won't be able to see it again).

### Using Your Token
When Git prompts you in terminal:
- **Username**: Your GitHub username
- **Password**: Paste your Personal Access Token (`ghp_xxxxxxxxxxxx`)

### Embed Token in Remote URL (Optional Quick Setup)
If you prefer not to enter credentials repeatedly on your local machine:
```bash
git remote set-url origin https://<YOUR_TOKEN>@github.com/husnainshafiq-dev/AgriGrow-A-plant-management-and-disease-detection-system.git
```

---

## 6. Multi-Remote Workflows (Origin vs Upstream)

In projects with a fork or central repository, you may have two remotes:
- **origin**: Your working/forked repository (`husnainshafiq-dev`)
- **upstream**: The parent or shared repository (`husnaincoder`)

### Check Configured Remotes
```bash
git remote -v
```

### Sync with Upstream
To bring the latest changes from the upstream base repo into your local repo:
```bash
# Fetch latest commits from upstream
git fetch upstream

# Merge upstream main into your current branch
git merge upstream/main

# Push the synced changes to your personal GitHub repo
git push origin main
```

---

## 7. Troubleshooting & Common Errors

### Error: `Updates were rejected because the remote contains work that you do not have locally`
**Why this happens:** Someone pushed changes to GitHub that you haven't pulled yet.  
**Fix:**
```bash
# Fetch and merge remote changes
git pull origin main --rebase

# Then push again
git push origin main
```

---

### Error: `Support for password authentication was removed on August 13, 2021`
**Why this happens:** You entered your GitHub account password instead of a Personal Access Token.  
**Fix:**  
Use a Personal Access Token (PAT) as explained in [Section 5](#5-github-authentication-personal-access-token--credentials).

---

### How to Unstage a File (Undo `git add`)
If you accidentally staged a file you didn't want to commit:
```bash
git restore --staged <file-path>
```

---

### How to Discard Local Changes in a File
If you modified a file and want to revert it back to the last committed state:
```bash
git restore <file-path>
```

---

### How to View Recent Commits
To check the commit history:
```bash
# Compact view
git log --oneline -n 5

# Detailed view with author and date
git log -n 3
```

---

## 8. AgriGrow Quick Cheat Sheet

Whenever you finish a coding session on AgriGrow, run these 4 commands:

```bash
# 1. Check changes
git status

# 2. Stage files
git add .

# 3. Commit with a message
git commit -m "your description here"

# 4. Push to GitHub
git push origin main
```

---
*Document prepared for AgriGrow Project - System Documentation.*
