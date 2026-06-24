import re

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .db import get_db
from .models import User
from .schemas import UserCreate, UserOut

router = APIRouter(prefix="/api/users", tags=["users"])

USERNAME_RE = re.compile(r"^[a-zA-Z0-9_-]{3,30}$")


def normalize_username(username: str) -> str:
    normalized = username.strip().lower()
    if not USERNAME_RE.fullmatch(normalized):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Username must be 3-30 characters and contain only letters, "
                "numbers, underscores, or hyphens"
            ),
        )
    return normalized


@router.get("", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db)) -> list[User]:
    return list(db.scalars(select(User).order_by(User.username.asc())).all())


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(payload: UserCreate, db: Session = Depends(get_db)) -> User:
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
    return user

