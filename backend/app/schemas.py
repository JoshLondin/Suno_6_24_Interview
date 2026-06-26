from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class UserCreate(BaseModel):
    username: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    profile_photo_url: Optional[str]
    description: Optional[str]
    created_at: datetime


class UserProfileOut(UserOut):
    video_count: int


class UserProfileUpdate(BaseModel):
    description: Optional[str] = Field(default=None, max_length=280)


class VideoOut(BaseModel):
    id: int
    user_id: int
    username: str
    user_profile_photo_url: Optional[str]
    video_url: str
    content_type: str
    file_size_bytes: int
    duration_seconds: Optional[float]
    created_at: datetime
    like_count: int
    liked_by_current_user: bool
    comment_count: int


class FeedOut(BaseModel):
    items: list[VideoOut]
    next_offset: int
    has_more: bool


class LikeRequest(BaseModel):
    user_id: int


class LikeResponse(BaseModel):
    video_id: int
    liked: bool
    like_count: int
