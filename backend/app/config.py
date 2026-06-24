import os
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent
BACKEND_DIR = APP_DIR.parent
MEDIA_DIR = BACKEND_DIR / "media"
VIDEO_DIR = MEDIA_DIR / "videos"

DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{BACKEND_DIR / 'app.db'}")

MAX_VIDEO_BYTES = 50 * 1024 * 1024

ALLOWED_VIDEO_TYPES = {
    "video/webm": ".webm",
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
}

CORS_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
