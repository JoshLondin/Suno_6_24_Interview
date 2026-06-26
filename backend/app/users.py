import re
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import desc, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from .config import PROFILE_PHOTO_DIR
from .db import get_db
from .models import User, Video
from .schemas import FeedOut, UserCreate, UserOut, UserProfileOut, UserProfileUpdate
from .storage import generate_profile_photo_filename, save_profile_photo_with_limit
from .videos import video_to_out

router = APIRouter(prefix="/api/users", tags=["users"])

USERNAME_RE = re.compile(r"^[a-zA-Z0-9_-]{3,30}$")


def normalize_username(username: str) -> str:
    normalized = username.strip()
    if not USERNAME_RE.fullmatch(normalized):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Username must be 3-30 characters and contain only letters, "
                "numbers, underscores, or hyphens"
            ),
        )
    return normalized


def get_user_or_404(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


def profile_photo_url_for_user(user: User) -> Optional[str]:
    if not user.profile_photo_filename:
        return None
    return f"/media/profile_photos/{user.profile_photo_filename}"


def user_to_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        username=user.username,
        profile_photo_url=profile_photo_url_for_user(user),
        description=user.description,
        created_at=user.created_at,
    )


def user_to_profile_out(db: Session, user: User) -> UserProfileOut:
    video_count = db.query(Video).filter(Video.user_id == user.id).count()
    return UserProfileOut(
        **user_to_out(user).model_dump(),
        video_count=video_count,
    )


@router.get("", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db)) -> list[UserOut]:
    users = list(db.scalars(select(User).order_by(User.username.asc())).all())
    return [user_to_out(user) for user in users]


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(payload: UserCreate, db: Session = Depends(get_db)) -> UserOut:
    username = normalize_username(payload.username)
    existing = db.scalar(select(User).where(User.username == username))
    if existing:
        raise HTTPException(status_code=409, detail="Username already exists")

    user = User(username=username)
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Username already exists") from None

    db.refresh(user)
    return user_to_out(user)


@router.get("/{user_id}", response_model=UserProfileOut)
def get_user_profile(user_id: int, db: Session = Depends(get_db)) -> UserProfileOut:
    user = get_user_or_404(db, user_id)
    return user_to_profile_out(db, user)


@router.patch("/{user_id}/profile", response_model=UserProfileOut)
def update_user_profile(
    user_id: int,
    payload: UserProfileUpdate,
    db: Session = Depends(get_db),
) -> UserProfileOut:
    user = get_user_or_404(db, user_id)
    user.description = payload.description.strip() or None if payload.description is not None else None
    db.commit()
    db.refresh(user)
    return user_to_profile_out(db, user)


@router.post("/{user_id}/profile-photo", response_model=UserProfileOut)
async def upload_profile_photo(
    user_id: int,
    photo: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> UserProfileOut:
    user = get_user_or_404(db, user_id)
    filename = generate_profile_photo_filename(photo.content_type)
    destination = PROFILE_PHOTO_DIR / filename
    await save_profile_photo_with_limit(photo, destination)

    old_filename = user.profile_photo_filename
    user.profile_photo_filename = filename
    try:
        db.commit()
        db.refresh(user)
    except Exception:
        db.rollback()
        destination.unlink(missing_ok=True)
        raise

    if old_filename:
        (PROFILE_PHOTO_DIR / old_filename).unlink(missing_ok=True)

    return user_to_profile_out(db, user)


@router.get("/{user_id}/videos", response_model=FeedOut)
def get_user_videos(
    user_id: int,
    limit: int = Query(default=20, ge=1, le=50),
    offset: int = Query(default=0, ge=0),
    viewer_user_id: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
) -> FeedOut:
    get_user_or_404(db, user_id)
    statement = (
        select(Video)
        .options(joinedload(Video.user))
        .where(Video.user_id == user_id)
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
