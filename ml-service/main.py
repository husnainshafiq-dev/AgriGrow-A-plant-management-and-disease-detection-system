"""
Entry point for Render and ASGI runners that expect `main:app`.
Re-exports the FastAPI `app` instance from `app.py`.
"""
import os
import uvicorn
from app import app

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
