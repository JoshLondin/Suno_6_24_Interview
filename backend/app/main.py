from contextlib import asynccontextmanager
from collections.abc import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .config import CORS_ORIGINS, MEDIA_DIR
from .db import Base, engine
from . import models  # noqa: F401 - register SQLAlchemy models
from .storage import ensure_video_dir
from .users import router as users_router


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    ensure_video_dir()
    Base.metadata.create_all(bind=engine)
    yield


ensure_video_dir()

app = FastAPI(title="Short-Form Video App", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/media", StaticFiles(directory=str(MEDIA_DIR)), name="media")
app.include_router(users_router)


@app.get("/api/health")
def health() -> dict[str, bool]:
    return {"ok": True}
