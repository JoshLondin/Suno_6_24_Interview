from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class UserCreate(BaseModel):
    username: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    created_at: datetime


class VideoOut(BaseModel):
    id: int
    user_id: int
    username: str
    video_url: str
    content_type: str
    file_size_bytes: int
    duration_seconds: Optional[float]
    created_at: datetime


class FeedOut(BaseModel):
    items: list[VideoOut]
    next_offset: int
    has_more: bool
