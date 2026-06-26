from __future__ import annotations

import uuid
from pathlib import Path
from typing import Optional

from fastapi import HTTPException, UploadFile

from .config import (
    ALLOWED_PROFILE_PHOTO_TYPES,
    ALLOWED_VIDEO_TYPES,
    MAX_PROFILE_PHOTO_BYTES,
    MAX_VIDEO_BYTES,
    PROFILE_PHOTO_DIR,
    VIDEO_DIR,
)


def ensure_media_dirs() -> None:
    VIDEO_DIR.mkdir(parents=True, exist_ok=True)
    PROFILE_PHOTO_DIR.mkdir(parents=True, exist_ok=True)


def ensure_video_dir() -> None:
    ensure_media_dirs()


def generate_video_filename(content_type: Optional[str]) -> str:
    if content_type not in ALLOWED_VIDEO_TYPES:
        raise HTTPException(status_code=415, detail="Unsupported video type")
    return f"{uuid.uuid4().hex}{ALLOWED_VIDEO_TYPES[content_type]}"


def generate_profile_photo_filename(content_type: Optional[str]) -> str:
    if content_type not in ALLOWED_PROFILE_PHOTO_TYPES:
        raise HTTPException(status_code=415, detail="Unsupported profile photo type")
    return f"{uuid.uuid4().hex}{ALLOWED_PROFILE_PHOTO_TYPES[content_type]}"


async def save_upload_file_with_limit(file: UploadFile, destination: Path) -> int:
    total = 0
    try:
        with destination.open("wb") as output:
            while chunk := await file.read(1024 * 1024):
                total += len(chunk)
                if total > MAX_VIDEO_BYTES:
                    raise HTTPException(status_code=413, detail="Video too large")
                output.write(chunk)

        if total == 0:
            raise HTTPException(status_code=400, detail="Empty video file")
        return total
    except Exception:
        destination.unlink(missing_ok=True)
        raise
    finally:
        await file.close()


async def save_profile_photo_with_limit(file: UploadFile, destination: Path) -> int:
    total = 0
    try:
        with destination.open("wb") as output:
            while chunk := await file.read(1024 * 1024):
                total += len(chunk)
                if total > MAX_PROFILE_PHOTO_BYTES:
                    raise HTTPException(status_code=413, detail="Profile photo too large")
                output.write(chunk)

        if total == 0:
            raise HTTPException(status_code=400, detail="Empty profile photo")
        return total
    except Exception:
        destination.unlink(missing_ok=True)
        raise
    finally:
        await file.close()
