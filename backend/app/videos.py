from __future__ import annotations

from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy import desc, select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session, joinedload

from .config import VIDEO_DIR
from .db import get_db
from .models import User, Video, VideoLike
from .schemas import FeedOut, LikeRequest, LikeResponse, VideoOut
from .storage import generate_video_filename, save_upload_file_with_limit

router = APIRouter(prefix="/api/videos", tags=["videos"])


def profile_photo_url_for_user(user: User) -> Optional[str]:
    filename = getattr(user, "profile_photo_filename", None)
    if not filename:
        return None
    return f"/media/profile_photos/{filename}"


def get_video_or_404(db: Session, video_id: int) -> Video:
    video = db.get(Video, video_id)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    return video


def get_user_or_404(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


def get_like_count(db: Session, video_id: int) -> int:
    return db.query(VideoLike).filter(VideoLike.video_id == video_id).count()


def is_liked_by_user(
    db: Session,
    *,
    video_id: int,
    viewer_user_id: Optional[int],
) -> bool:
    if viewer_user_id is None:
        return False
    return (
        db.query(VideoLike)
        .filter(VideoLike.video_id == video_id, VideoLike.user_id == viewer_user_id)
        .first()
        is not None
    )


def get_comment_count(db: Session, video_id: int) -> int:
    return 0


def video_to_out(
    db: Session,
    video: Video,
    *,
    viewer_user_id: Optional[int] = None,
) -> VideoOut:
    return VideoOut(
        id=video.id,
        user_id=video.user_id,
        username=video.user.username,
        user_profile_photo_url=profile_photo_url_for_user(video.user),
        video_url=f"/media/videos/{video.filename}",
        content_type=video.content_type,
        file_size_bytes=video.file_size_bytes,
        duration_seconds=video.duration_seconds,
        created_at=video.created_at,
        like_count=get_like_count(db, video.id),
        liked_by_current_user=is_liked_by_user(
            db,
            video_id=video.id,
            viewer_user_id=viewer_user_id,
        ),
        comment_count=get_comment_count(db, video.id),
    )


@router.post("", response_model=VideoOut, status_code=201)
async def upload_video(
    user_id: int = Form(...),
    video: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> VideoOut:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    filename = generate_video_filename(video.content_type)
    destination = VIDEO_DIR / filename
    file_size = await save_upload_file_with_limit(video, destination)

    record = Video(
        user_id=user.id,
        filename=filename,
        original_filename=Path(video.filename).name if video.filename else None,
        content_type=video.content_type or "application/octet-stream",
        file_size_bytes=file_size,
    )
    db.add(record)
    try:
        db.commit()
        db.refresh(record)
        record.user = user
        return video_to_out(db, record, viewer_user_id=user.id)
    except SQLAlchemyError:
        db.rollback()
        destination.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail="Could not save video") from None


@router.get("/feed", response_model=FeedOut)
def get_feed(
    limit: int = Query(default=20, ge=1, le=50),
    offset: int = Query(default=0, ge=0),
    viewer_user_id: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
) -> FeedOut:
    statement = (
        select(Video)
        .options(joinedload(Video.user))
        .order_by(desc(Video.created_at), desc(Video.id))
        .offset(offset)
        .limit(limit + 1)
    )
    results = list(db.scalars(statement).all())
    has_more = len(results) > limit
    page = results[:limit]
    return FeedOut(
        items=[
            video_to_out(db, video, viewer_user_id=viewer_user_id)
            for video in page
        ],
        next_offset=offset + len(page),
        has_more=has_more,
    )


@router.post("/{video_id}/like", response_model=LikeResponse)
def like_video(
    video_id: int,
    payload: LikeRequest,
    db: Session = Depends(get_db),
) -> LikeResponse:
    get_video_or_404(db, video_id)
    get_user_or_404(db, payload.user_id)

    existing = (
        db.query(VideoLike)
        .filter(VideoLike.video_id == video_id, VideoLike.user_id == payload.user_id)
        .first()
    )
    if not existing:
        db.add(VideoLike(video_id=video_id, user_id=payload.user_id))
        try:
            db.commit()
        except IntegrityError:
            db.rollback()

    return LikeResponse(video_id=video_id, liked=True, like_count=get_like_count(db, video_id))


@router.delete("/{video_id}/like", response_model=LikeResponse)
def unlike_video(
    video_id: int,
    user_id: int = Query(...),
    db: Session = Depends(get_db),
) -> LikeResponse:
    get_video_or_404(db, video_id)
    get_user_or_404(db, user_id)

    existing = (
        db.query(VideoLike)
        .filter(VideoLike.video_id == video_id, VideoLike.user_id == user_id)
        .first()
    )
    if existing:
        db.delete(existing)
        db.commit()

    return LikeResponse(video_id=video_id, liked=False, like_count=get_like_count(db, video_id))
