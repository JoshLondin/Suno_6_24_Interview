from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy import desc, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, joinedload

from .config import VIDEO_DIR
from .db import get_db
from .models import User, Video
from .schemas import FeedOut, VideoOut
from .storage import generate_video_filename, save_upload_file_with_limit

router = APIRouter(prefix="/api/videos", tags=["videos"])


def video_to_out(video: Video) -> VideoOut:
    return VideoOut(
        id=video.id,
        user_id=video.user_id,
        username=video.user.username,
        video_url=f"/media/videos/{video.filename}",
        content_type=video.content_type,
        file_size_bytes=video.file_size_bytes,
        duration_seconds=video.duration_seconds,
        created_at=video.created_at,
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
        return video_to_out(record)
    except SQLAlchemyError:
        db.rollback()
        destination.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail="Could not save video") from None


@router.get("/feed", response_model=FeedOut)
def get_feed(
    limit: int = Query(default=20, ge=1, le=50),
    offset: int = Query(default=0, ge=0),
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
        items=[video_to_out(video) for video in page],
        next_offset=offset + len(page),
        has_more=has_more,
    )
