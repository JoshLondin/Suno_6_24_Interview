# CODEX Implementation Plan: Short-Form Video Reels App

## 1. Product Goal

Build a lightweight TikTok / Instagram Reels-style short-form video app.

The product has three core capabilities:

1. **User entities**
   - A user must be linked to an account-like entity.
   - No password or real authentication is needed.
   - Users can create a new username.
   - Users can select from a dropdown of all existing users to “sign in” as that account.

2. **Creation**
   - A signed-in user can record up to 30 seconds of video from their computer camera.
   - A signed-in user can upload a video file.
   - Uploaded video files should have a reasonable max size comparable to a 30-second recording.

3. **Consumption**
   - Users can consume a reels-style feed.
   - The feed is chronological, newest first.
   - Feed navigation is discrete, not continuous:
     - One video is active at a time.
     - User cannot stop halfway between videos.
     - Swipe down advances to the next video.
     - Swipe up navigates to the previous video.
     - Keyboard support should mirror this:
       - ArrowDown / PageDown: next video.
       - ArrowUp / PageUp: previous video.
   - Only the active video should play.
   - All inactive videos should be paused.

---

## 2. Recommended Stack

Use a simple local-first full-stack app.

### Frontend

- React
- TypeScript
- Vite
- Plain CSS or CSS modules
- Browser APIs:
  - `navigator.mediaDevices.getUserMedia`
  - `MediaRecorder`
  - `HTMLVideoElement`
  - Pointer/touch/wheel/keyboard events

### Backend

- Python
- FastAPI
- SQLite
- SQLAlchemy
- Pydantic
- Local filesystem for storing uploaded videos

### Storage

For MVP:

- Store video files in `backend/media/videos`.
- Store video metadata in SQLite.

Production alternative to mention in interview:

- Store videos in object storage like S3/GCS.
- Serve through CDN.
- Transcode to standardized HLS/DASH renditions.

---

## 3. High-Level Architecture

```text
Browser React App
  |
  | REST API
  v
FastAPI Backend
  |
  | SQLAlchemy ORM
  v
SQLite Database
  |
  | local file writes / reads
  v
backend/media/videos
```

The backend owns:

- User records
- Video metadata
- File upload validation
- Chronological feed query
- Static serving of video files

The frontend owns:

- Active selected user state
- User switching UI
- Recording UI
- Upload UI
- Reels player UI
- Discrete swipe navigation
- Active video playback control

---

## 4. Key Product Decisions

### 4.1 No real auth

This is intentional per prompt.

The “signed-in user” is whichever user is selected from the dropdown. The selected user should be stored in `localStorage` so a refresh restores the active account.

### 4.2 Recording limit

Max recording time:

```ts
const MAX_RECORDING_SECONDS = 30;
```

The frontend must stop camera recordings automatically after 30 seconds.

### 4.3 Upload size limit

Use:

```python
MAX_VIDEO_BYTES = 50 * 1024 * 1024  # 50 MB
```

Rationale:

- Reasonable approximation for a 30-second short-form video.
- Supports moderate-quality webcam clips.
- Avoids very large local uploads.
- Easy to enforce in frontend and backend.

The frontend should reject large files before upload.

The backend must enforce the size limit while streaming the upload to disk.

### 4.4 Upload duration validation

MVP requirement:

- Frontend should check uploaded video duration using browser metadata when possible.
- Backend enforces file size and content type.

Optional production-quality improvement:

- Backend validates duration with `ffprobe`.
- Backend rejects videos longer than 30 seconds regardless of frontend behavior.

For this implementation, do not require `ffprobe` because it complicates Docker/local setup.

### 4.5 Feed navigation

Important change from earlier plan:

Do **not** use “70% visible to play” logic.

Instead:

- Feed is controlled by an integer `activeIndex`.
- Exactly one reel is active at a time.
- Swiping down increments `activeIndex`.
- Swiping up decrements `activeIndex`.
- The viewport should programmatically snap/scroll to the active reel.
- During or after the gesture, the UI should settle on a single reel.
- There should be no stable state where two videos are half visible.
- Only the active reel’s video should play.

Implementation approach:

- Use a full-height feed viewport with `overflow: hidden`.
- Render a vertical stack translated by active index.
- Use CSS transform:

```css
.reels-track {
  transform: translateY(calc(-1 * var(--active-index) * 100%));
  transition: transform 220ms ease-out;
}
```

This avoids relying on browser scroll-snap ambiguity.

---

## 5. Repository Structure

```text
short-video-app/
  README.md
  docker-compose.yml

  backend/
    Dockerfile
    requirements.txt
    app/
      __init__.py
      main.py
      config.py
      db.py
      models.py
      schemas.py
      users.py
      videos.py
      storage.py
    media/
      videos/

  frontend/
    Dockerfile
    package.json
    index.html
    vite.config.ts
    src/
      main.tsx
      App.tsx
      api.ts
      types.ts
      styles.css
      components/
        UserSwitcher.tsx
        CreateVideo.tsx
        ReelsFeed.tsx
        ReelCard.tsx
```

---

## 6. Backend Data Model

### 6.1 User entity

A user represents a lightweight account.

Fields:

```text
id
username
created_at
```

Constraints:

- `username` is required.
- `username` is unique.
- Store username normalized to lowercase.
- Allowed username characters:
  - letters
  - numbers
  - underscores
  - hyphens
- Length: 3 to 30 characters.

### 6.2 Video entity

A video belongs to one user.

Fields:

```text
id
user_id
filename
original_filename
content_type
file_size_bytes
duration_seconds nullable
created_at
```

Actual file contents are stored on local disk.

---

## 7. SQL Schema

Use SQLAlchemy models, but this SQL describes the intended schema.

### 7.1 `users`

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

Index:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username);
```

Implementation note:

- Normalize usernames to lowercase before insert.
- This avoids needing a SQLite expression index on `lower(username)`.

### 7.2 `videos`

```sql
CREATE TABLE videos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  filename TEXT NOT NULL,
  original_filename TEXT,
  content_type TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  duration_seconds REAL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
```

Indexes:

```sql
CREATE INDEX IF NOT EXISTS idx_videos_created_at_id
ON videos(created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_videos_user_id
ON videos(user_id);
```

---

## 8. Backend API Contract

Base URL in local development:

```text
http://localhost:8000
```

Frontend should use:

```text
VITE_API_BASE_URL=http://localhost:8000
```

### 8.1 Health check

#### `GET /api/health`

Response:

```json
{
  "ok": true
}
```

---

### 8.2 List users

#### `GET /api/users`

Returns all users ordered alphabetically by username.

Response:

```json
[
  {
    "id": 1,
    "username": "josh",
    "created_at": "2026-06-24T12:00:00"
  }
]
```

---

### 8.3 Create user

#### `POST /api/users`

Request:

```json
{
  "username": "josh"
}
```

Validation:

- Trim whitespace.
- Lowercase username.
- Must match:

```regex
^[a-zA-Z0-9_-]{3,30}$
```

- Must be unique after normalization.

Success response:

```json
{
  "id": 1,
  "username": "josh",
  "created_at": "2026-06-24T12:00:00"
}
```

Errors:

```text
400 invalid username
409 username already exists
```

---

### 8.4 Upload video

#### `POST /api/videos`

Request type:

```text
multipart/form-data
```

Fields:

```text
user_id: integer
video: file
```

Allowed content types:

```python
ALLOWED_VIDEO_TYPES = {
    "video/webm": ".webm",
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
}
```

Max file size:

```python
MAX_VIDEO_BYTES = 50 * 1024 * 1024
```

Validation:

- `user_id` is required.
- User must exist.
- `video` is required.
- Content type must be allowed.
- File size must be <= 50 MB.
- Store file using a generated UUID filename.
- Never trust or directly use the original filename for storage.
- Preserve original filename only as metadata.

Success response:

```json
{
  "id": 123,
  "user_id": 1,
  "username": "josh",
  "video_url": "/media/videos/95d6e6b9499e4468ad4d3eb2e22cd8f4.webm",
  "content_type": "video/webm",
  "file_size_bytes": 10485760,
  "duration_seconds": null,
  "created_at": "2026-06-24T12:00:00"
}
```

Errors:

```text
400 invalid upload
404 user not found
413 video too large
415 unsupported media type
```

---

### 8.5 Fetch chronological feed

#### `GET /api/videos/feed`

Query params:

```text
limit: integer, default 20, min 1, max 50
offset: integer, default 0, min 0
```

Ordering:

```sql
ORDER BY videos.created_at DESC, videos.id DESC
```

Response:

```json
{
  "items": [
    {
      "id": 123,
      "user_id": 1,
      "username": "josh",
      "video_url": "/media/videos/95d6e6b9499e4468ad4d3eb2e22cd8f4.webm",
      "content_type": "video/webm",
      "file_size_bytes": 10485760,
      "duration_seconds": null,
      "created_at": "2026-06-24T12:00:00"
    }
  ],
  "next_offset": 20,
  "has_more": true
}
```

Implementation:

- Fetch `limit + 1`.
- If result count exceeds `limit`, set `has_more = true`.
- Return only `limit` items.

---

### 8.6 Serve media

Mount static media:

```python
app.mount("/media", StaticFiles(directory=str(MEDIA_DIR)), name="media")
```

A video URL should look like:

```text
/media/videos/{filename}
```

The frontend should resolve this relative to the backend base URL.

---

## 9. Backend Types / Pydantic Schemas

### 9.1 User schemas

```python
from datetime import datetime
from pydantic import BaseModel, Field

class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=30)

class UserOut(BaseModel):
    id: int
    username: str
    created_at: datetime

    class Config:
        from_attributes = True
```

### 9.2 Video schemas

```python
from datetime import datetime
from pydantic import BaseModel

class VideoOut(BaseModel):
    id: int
    user_id: int
    username: str
    video_url: str
    content_type: str
    file_size_bytes: int
    duration_seconds: float | None
    created_at: datetime

class FeedOut(BaseModel):
    items: list[VideoOut]
    next_offset: int
    has_more: bool
```

---

## 10. Backend Code Snippets

### 10.1 `backend/app/config.py`

```python
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent
BACKEND_DIR = APP_DIR.parent

MEDIA_DIR = BACKEND_DIR / "media"
VIDEO_DIR = MEDIA_DIR / "videos"

MAX_VIDEO_BYTES = 50 * 1024 * 1024

ALLOWED_VIDEO_TYPES = {
    "video/webm": ".webm",
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
}

CORS_ORIGINS = [
    "http://localhost:5173",
]
```

---

### 10.2 `backend/app/db.py`

```python
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

DATABASE_URL = "sqlite:///./app.db"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

---

### 10.3 `backend/app/models.py`

```python
from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from .db import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, nullable=False, unique=True, index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    videos = relationship("Video", back_populates="user")


class Video(Base):
    __tablename__ = "videos"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    filename = Column(String, nullable=False)
    original_filename = Column(String, nullable=True)
    content_type = Column(String, nullable=False)
    file_size_bytes = Column(Integer, nullable=False)
    duration_seconds = Column(Float, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), index=True)

    user = relationship("User", back_populates="videos")
```

---

### 10.4 `backend/app/storage.py`

```python
import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile

from .config import ALLOWED_VIDEO_TYPES, MAX_VIDEO_BYTES, VIDEO_DIR

def ensure_video_dir() -> None:
    VIDEO_DIR.mkdir(parents=True, exist_ok=True)

def generate_video_filename(content_type: str) -> str:
    if content_type not in ALLOWED_VIDEO_TYPES:
        raise HTTPException(status_code=415, detail="Unsupported video type")
    ext = ALLOWED_VIDEO_TYPES[content_type]
    return f"{uuid.uuid4().hex}{ext}"

async def save_upload_file_with_limit(file: UploadFile, destination: Path) -> int:
    total = 0

    try:
        with destination.open("wb") as out:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break

                total += len(chunk)

                if total > MAX_VIDEO_BYTES:
                    try:
                        destination.unlink(missing_ok=True)
                    finally:
                        raise HTTPException(status_code=413, detail="Video too large")

                out.write(chunk)

        if total == 0:
            destination.unlink(missing_ok=True)
            raise HTTPException(status_code=400, detail="Empty video file")

        return total

    except HTTPException:
        raise
    except Exception:
        destination.unlink(missing_ok=True)
        raise
```

---

### 10.5 Username normalization

```python
import re
from fastapi import HTTPException

USERNAME_RE = re.compile(r"^[a-zA-Z0-9_-]{3,30}$")

def normalize_username(username: str) -> str:
    normalized = username.strip().lower()

    if not USERNAME_RE.fullmatch(normalized):
        raise HTTPException(
            status_code=400,
            detail="Username must be 3-30 characters and contain only letters, numbers, underscores, or hyphens",
        )

    return normalized
```

---

### 10.6 Feed item mapper

```python
from .models import Video

def video_to_out(video: Video) -> dict:
    return {
        "id": video.id,
        "user_id": video.user_id,
        "username": video.user.username,
        "video_url": f"/media/videos/{video.filename}",
        "content_type": video.content_type,
        "file_size_bytes": video.file_size_bytes,
        "duration_seconds": video.duration_seconds,
        "created_at": video.created_at,
    }
```

---

## 11. Backend Route Implementation Plan

### 11.1 `backend/app/users.py`

Implement an APIRouter with:

```python
router = APIRouter(prefix="/api/users", tags=["users"])
```

Routes:

```python
@router.get("", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db)):
    ...
```

Algorithm:

1. Query all users ordered by username ascending.
2. Return users.

```python
@router.post("", response_model=UserOut)
def create_user(payload: UserCreate, db: Session = Depends(get_db)):
    ...
```

Algorithm:

1. Normalize username.
2. Check if existing user exists with that normalized username.
3. If yes, raise 409.
4. Create user.
5. Commit.
6. Refresh.
7. Return.

---

### 11.2 `backend/app/videos.py`

Implement an APIRouter with:

```python
router = APIRouter(prefix="/api/videos", tags=["videos"])
```

Routes:

```python
@router.post("", response_model=VideoOut)
async def upload_video(
    user_id: int = Form(...),
    video: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    ...
```

Algorithm:

1. Query user by `user_id`.
2. If missing, raise 404.
3. Validate `video.content_type` is allowed.
4. Generate UUID storage filename.
5. Save upload to disk with streaming size enforcement.
6. Insert video DB row.
7. Commit.
8. Refresh.
9. Return `VideoOut`.

Failure handling:

- If DB insert fails after file write, delete the saved file.
- If size exceeds limit during write, delete partial file.

```python
@router.get("/feed", response_model=FeedOut)
def get_feed(
    limit: int = Query(default=20, ge=1, le=50),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    ...
```

Algorithm:

1. Query videos joined with users.
2. Order by `created_at DESC, id DESC`.
3. Offset by `offset`.
4. Limit by `limit + 1`.
5. Determine `has_more`.
6. Return `items`, `next_offset`, `has_more`.

---

### 11.3 `backend/app/main.py`

Required setup:

1. Create app.
2. Configure CORS.
3. Ensure video directory exists.
4. Create DB tables.
5. Include routers.
6. Mount `/media`.
7. Add health check.

Skeleton:

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .config import CORS_ORIGINS, MEDIA_DIR
from .db import Base, engine
from .storage import ensure_video_dir
from .users import router as users_router
from .videos import router as videos_router

app = FastAPI(title="Short-Form Video App")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ensure_video_dir()
Base.metadata.create_all(bind=engine)

app.include_router(users_router)
app.include_router(videos_router)

app.mount("/media", StaticFiles(directory=str(MEDIA_DIR)), name="media")

@app.get("/api/health")
def health():
    return {"ok": True}
```

---

## 12. Frontend Types

Create `frontend/src/types.ts`.

```ts
export type User = {
  id: number;
  username: string;
  created_at: string;
};

export type Video = {
  id: number;
  user_id: number;
  username: string;
  video_url: string;
  content_type: string;
  file_size_bytes: number;
  duration_seconds: number | null;
  created_at: string;
};

export type FeedResponse = {
  items: Video[];
  next_offset: number;
  has_more: boolean;
};
```

---

## 13. Frontend API Client

Create `frontend/src/api.ts`.

```ts
import type { FeedResponse, User, Video } from "./types";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

async function parseError(response: Response): Promise<string> {
  try {
    const body = await response.json();
    return body.detail ?? `Request failed with ${response.status}`;
  } catch {
    return `Request failed with ${response.status}`;
  }
}

export function resolveMediaUrl(videoUrl: string): string {
  if (videoUrl.startsWith("http")) return videoUrl;
  return `${API_BASE_URL}${videoUrl}`;
}

export async function fetchUsers(): Promise<User[]> {
  const response = await fetch(`${API_BASE_URL}/api/users`);
  if (!response.ok) throw new Error(await parseError(response));
  return response.json();
}

export async function createUser(username: string): Promise<User> {
  const response = await fetch(`${API_BASE_URL}/api/users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ username }),
  });

  if (!response.ok) throw new Error(await parseError(response));
  return response.json();
}

export async function fetchFeed(
  limit = 20,
  offset = 0,
): Promise<FeedResponse> {
  const url = new URL(`${API_BASE_URL}/api/videos/feed`);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("offset", String(offset));

  const response = await fetch(url);
  if (!response.ok) throw new Error(await parseError(response));
  return response.json();
}

export async function uploadVideo(
  userId: number,
  file: Blob,
  filename: string,
): Promise<Video> {
  const formData = new FormData();
  formData.append("user_id", String(userId));
  formData.append("video", file, filename);

  const response = await fetch(`${API_BASE_URL}/api/videos`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) throw new Error(await parseError(response));
  return response.json();
}
```

---

## 14. Frontend Constants

Use these constants in `App.tsx` or a `constants.ts` file.

```ts
export const MAX_RECORDING_SECONDS = 30;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

export const ALLOWED_VIDEO_TYPES = new Set([
  "video/webm",
  "video/mp4",
  "video/quicktime",
]);
```

---

## 15. Frontend Component Plan

### 15.1 `App`

Responsibilities:

- Fetch users.
- Restore current user from localStorage.
- Store top-level `currentUser`.
- Render:
  - `UserSwitcher`
  - `CreateVideo`
  - `ReelsFeed`

State:

```ts
const [users, setUsers] = useState<User[]>([]);
const [currentUser, setCurrentUser] = useState<User | null>(null);
const [feedRefreshToken, setFeedRefreshToken] = useState(0);
```

When a video is posted:

```ts
setFeedRefreshToken((value) => value + 1);
```

Pass `feedRefreshToken` to `ReelsFeed` so it can refetch from the beginning.

---

### 15.2 `UserSwitcher`

Props:

```ts
type UserSwitcherProps = {
  users: User[];
  currentUser: User | null;
  onUsersChange: (users: User[]) => void;
  onCurrentUserChange: (user: User) => void;
};
```

Behavior:

- Shows dropdown of users.
- Shows input for new username.
- Creates user through API.
- On successful creation:
  - Adds new user to user list.
  - Sets current user.
  - Saves current user ID in localStorage.

Pseudocode:

```ts
async function handleCreateUser() {
  setError(null);

  try {
    const created = await createUser(newUsername);
    const nextUsers = [...users, created].sort((a, b) =>
      a.username.localeCompare(b.username),
    );

    onUsersChange(nextUsers);
    onCurrentUserChange(created);
    localStorage.setItem("currentUserId", String(created.id));
    setNewUsername("");
  } catch (error) {
    setError(error instanceof Error ? error.message : "Failed to create user");
  }
}
```

---

### 15.3 `CreateVideo`

Props:

```ts
type CreateVideoProps = {
  currentUser: User | null;
  onVideoPosted: () => void;
};
```

Responsibilities:

- Disable creation if no user selected.
- Allow camera recording.
- Allow file upload.
- Validate file size/type.
- Show preview.
- Upload selected/recorded blob.

Internal state:

```ts
type RecordingState =
  | "idle"
  | "requesting_permission"
  | "recording"
  | "preview"
  | "uploading"
  | "error";

const [recordingState, setRecordingState] = useState<RecordingState>("idle");
const [previewUrl, setPreviewUrl] = useState<string | null>(null);
const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
const [selectedFile, setSelectedFile] = useState<File | null>(null);
const [error, setError] = useState<string | null>(null);
const [elapsedSeconds, setElapsedSeconds] = useState(0);
```

Refs:

```ts
const mediaRecorderRef = useRef<MediaRecorder | null>(null);
const streamRef = useRef<MediaStream | null>(null);
const recordingTimerRef = useRef<number | null>(null);
const elapsedIntervalRef = useRef<number | null>(null);
const chunksRef = useRef<Blob[]>([]);
```

Cleanup:

```ts
function stopStreamTracks() {
  streamRef.current?.getTracks().forEach((track) => track.stop());
  streamRef.current = null;
}

function clearTimers() {
  if (recordingTimerRef.current !== null) {
    window.clearTimeout(recordingTimerRef.current);
    recordingTimerRef.current = null;
  }

  if (elapsedIntervalRef.current !== null) {
    window.clearInterval(elapsedIntervalRef.current);
    elapsedIntervalRef.current = null;
  }
}

function clearPreview() {
  if (previewUrl) {
    URL.revokeObjectURL(previewUrl);
  }
  setPreviewUrl(null);
}
```

---

## 16. Camera Recording Implementation Details

### 16.1 Start recording

Pseudocode:

```ts
async function startRecording() {
  if (!currentUser) {
    setError("Select a user first");
    return;
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    setError("Camera recording is not supported in this browser");
    return;
  }

  if (!window.MediaRecorder) {
    setError("MediaRecorder is not supported in this browser");
    return;
  }

  setError(null);
  setRecordingState("requesting_permission");
  clearPreview();
  setSelectedFile(null);
  setRecordedBlob(null);
  chunksRef.current = [];

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });

    streamRef.current = stream;

    const mimeType = MediaRecorder.isTypeSupported("video/webm")
      ? "video/webm"
      : "";

    const recorder = new MediaRecorder(
      stream,
      mimeType ? { mimeType } : undefined,
    );

    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };

    recorder.onstop = () => {
      clearTimers();
      stopStreamTracks();

      const blob = new Blob(chunksRef.current, {
        type: "video/webm",
      });

      const url = URL.createObjectURL(blob);
      setRecordedBlob(blob);
      setPreviewUrl(url);
      setRecordingState("preview");
    };

    recorder.start();
    setElapsedSeconds(0);
    setRecordingState("recording");

    elapsedIntervalRef.current = window.setInterval(() => {
      setElapsedSeconds((value) => Math.min(value + 1, MAX_RECORDING_SECONDS));
    }, 1000);

    recordingTimerRef.current = window.setTimeout(() => {
      stopRecording();
    }, MAX_RECORDING_SECONDS * 1000);
  } catch (error) {
    clearTimers();
    stopStreamTracks();
    setRecordingState("idle");
    setError("Could not access camera or microphone");
  }
}
```

### 16.2 Stop recording

```ts
function stopRecording() {
  const recorder = mediaRecorderRef.current;

  if (recorder && recorder.state === "recording") {
    recorder.stop();
  } else {
    clearTimers();
    stopStreamTracks();
    setRecordingState("idle");
  }
}
```

### 16.3 Discard recording

```ts
function discardRecording() {
  clearTimers();
  stopStreamTracks();
  clearPreview();
  setRecordedBlob(null);
  setSelectedFile(null);
  setElapsedSeconds(0);
  setRecordingState("idle");
  setError(null);
}
```

---

## 17. Upload File Implementation Details

### 17.1 File selection validation

```ts
async function handleFileSelected(file: File) {
  setError(null);
  clearPreview();
  setRecordedBlob(null);

  if (!ALLOWED_VIDEO_TYPES.has(file.type)) {
    setError("Unsupported video type. Please upload a WebM, MP4, or MOV file.");
    return;
  }

  if (file.size > MAX_VIDEO_BYTES) {
    setError("Video must be 50 MB or smaller.");
    return;
  }

  try {
    const duration = await getVideoDuration(file);

    if (duration > MAX_RECORDING_SECONDS + 0.5) {
      setError("Uploaded video must be 30 seconds or shorter.");
      return;
    }
  } catch {
    // If duration cannot be read, allow upload as long as size/type validation passed.
    // Backend will still enforce size/type.
  }

  const url = URL.createObjectURL(file);
  setSelectedFile(file);
  setPreviewUrl(url);
  setRecordingState("preview");
}
```

### 17.2 Read client-side video duration

```ts
function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const objectUrl = URL.createObjectURL(file);

    video.preload = "metadata";

    video.onloadedmetadata = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(video.duration);
    };

    video.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not read video metadata"));
    };

    video.src = objectUrl;
  });
}
```

### 17.3 Post video

```ts
async function postVideo() {
  if (!currentUser) {
    setError("Select a user first");
    return;
  }

  const uploadSource = selectedFile ?? recordedBlob;

  if (!uploadSource) {
    setError("Record or select a video first");
    return;
  }

  setRecordingState("uploading");
  setError(null);

  try {
    const filename =
      selectedFile?.name ?? `recording-${new Date().toISOString()}.webm`;

    await uploadVideo(currentUser.id, uploadSource, filename);

    discardRecording();
    onVideoPosted();
  } catch (error) {
    setRecordingState("preview");
    setError(error instanceof Error ? error.message : "Failed to upload video");
  }
}
```

---

## 18. Reels Feed: Discrete Swipe Navigation

This is the most important frontend behavior.

### 18.1 UX rules

- There is exactly one active video at a time.
- The active video fills the feed viewport.
- User cannot rest halfway between videos.
- Swipe down means move to the next video.
- Swipe up means move to the previous video.
- Wheel down means move to the next video.
- Wheel up means move to the previous video.
- ArrowDown/PageDown means next.
- ArrowUp/PageUp means previous.
- Only active video plays.
- Inactive videos are paused and reset optionally to `currentTime = 0`.

### 18.2 State

Inside `ReelsFeed`:

```ts
const [videos, setVideos] = useState<Video[]>([]);
const [activeIndex, setActiveIndex] = useState(0);
const [offset, setOffset] = useState(0);
const [hasMore, setHasMore] = useState(false);
const [loading, setLoading] = useState(false);
const [error, setError] = useState<string | null>(null);
const [isTransitioning, setIsTransitioning] = useState(false);

const videoRefs = useRef<Map<number, HTMLVideoElement>>(new Map());
const touchStartYRef = useRef<number | null>(null);
const lastWheelAtRef = useRef<number>(0);
```

### 18.3 Layout approach

Do not use normal scroll behavior.

Use:

```css
.reels-viewport {
  height: 80vh;
  overflow: hidden;
  position: relative;
  background: #111;
  border-radius: 16px;
}

.reels-track {
  height: 100%;
  transition: transform 220ms ease-out;
  will-change: transform;
}

.reel-card {
  height: 80vh;
  width: 100%;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.reel-card video {
  max-height: 100%;
  max-width: 100%;
  object-fit: contain;
}
```

In React:

```tsx
<div
  className="reels-track"
  style={{
    transform: `translateY(-${activeIndex * 100}%)`,
  }}
>
  {videos.map((video, index) => (
    <ReelCard
      key={video.id}
      video={video}
      isActive={index === activeIndex}
      registerVideoRef={registerVideoRef}
    />
  ))}
</div>
```

Because each reel card is exactly the viewport height, translating by `100%` per index guarantees no 50/50 rest state.

### 18.4 Navigation helpers

```ts
function goToIndex(nextIndex: number) {
  if (videos.length === 0) return;

  const clamped = Math.max(0, Math.min(nextIndex, videos.length - 1));

  if (clamped === activeIndex) return;

  setActiveIndex(clamped);
  setIsTransitioning(true);

  window.setTimeout(() => {
    setIsTransitioning(false);
  }, 240);
}

function goNext() {
  if (activeIndex < videos.length - 1) {
    goToIndex(activeIndex + 1);
  } else if (hasMore && !loading) {
    void loadMoreAndAdvance();
  }
}

function goPrev() {
  goToIndex(activeIndex - 1);
}
```

### 18.5 Load more when reaching end

```ts
async function loadMoreAndAdvance() {
  if (loading || !hasMore) return;

  setLoading(true);

  try {
    const response = await fetchFeed(20, offset);
    setVideos((current) => [...current, ...response.items]);
    setOffset(response.next_offset);
    setHasMore(response.has_more);

    if (response.items.length > 0) {
      setActiveIndex((current) => current + 1);
    }
  } catch (error) {
    setError(error instanceof Error ? error.message : "Failed to load more videos");
  } finally {
    setLoading(false);
  }
}
```

Implementation note:

- Initial fetch should set `offset` to the response `next_offset`.
- On refresh token change, reset active index to 0 and reload from offset 0.

### 18.6 Touch swipe handling

Direction per prompt:

- Swipe down navigates to the next video.
- Swipe up navigates to the previous video.

Note: On many mobile apps, physical swipe up often advances. But the prompt explicitly says swipe down advances and swipe up goes back. Implement exactly as prompt says.

```ts
const SWIPE_THRESHOLD_PX = 50;

function handleTouchStart(event: React.TouchEvent) {
  touchStartYRef.current = event.touches[0]?.clientY ?? null;
}

function handleTouchEnd(event: React.TouchEvent) {
  const startY = touchStartYRef.current;
  touchStartYRef.current = null;

  if (startY === null) return;

  const endY = event.changedTouches[0]?.clientY;
  if (endY === undefined) return;

  const deltaY = endY - startY;

  if (Math.abs(deltaY) < SWIPE_THRESHOLD_PX) {
    return;
  }

  if (deltaY > 0) {
    // Finger moved down.
    // Per prompt: swipe down advances to next video.
    goNext();
  } else {
    // Finger moved up.
    // Per prompt: swipe up goes to previous video.
    goPrev();
  }
}
```

### 18.7 Wheel handling

```ts
const WHEEL_COOLDOWN_MS = 400;

function handleWheel(event: React.WheelEvent) {
  event.preventDefault();

  const now = Date.now();

  if (now - lastWheelAtRef.current < WHEEL_COOLDOWN_MS) {
    return;
  }

  lastWheelAtRef.current = now;

  if (event.deltaY > 0) {
    goNext();
  } else if (event.deltaY < 0) {
    goPrev();
  }
}
```

### 18.8 Keyboard handling

```ts
useEffect(() => {
  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "ArrowDown" || event.key === "PageDown") {
      event.preventDefault();
      goNext();
    }

    if (event.key === "ArrowUp" || event.key === "PageUp") {
      event.preventDefault();
      goPrev();
    }
  }

  window.addEventListener("keydown", handleKeyDown);

  return () => {
    window.removeEventListener("keydown", handleKeyDown);
  };
}, [activeIndex, videos.length, hasMore, loading, offset]);
```

### 18.9 Prevent browser scroll

The feed viewport should not scroll normally.

```tsx
<div
  className="reels-viewport"
  onWheel={handleWheel}
  onTouchStart={handleTouchStart}
  onTouchEnd={handleTouchEnd}
>
  ...
</div>
```

CSS:

```css
.reels-viewport {
  overscroll-behavior: contain;
  touch-action: none;
}
```

### 18.10 Active video playback

Use `activeIndex` as source of truth.

```ts
useEffect(() => {
  videos.forEach((video, index) => {
    const element = videoRefs.current.get(video.id);
    if (!element) return;

    if (index === activeIndex) {
      element.muted = true;
      element.play().catch(() => {
        // Browser may block autoplay.
        // Keep UI functional; user can manually play.
      });
    } else {
      element.pause();
      element.currentTime = 0;
    }
  });
}, [activeIndex, videos]);
```

### 18.11 Register video refs

In `ReelsFeed`:

```ts
const registerVideoRef = useCallback((videoId: number, element: HTMLVideoElement | null) => {
  if (element) {
    videoRefs.current.set(videoId, element);
  } else {
    videoRefs.current.delete(videoId);
  }
}, []);
```

Pass to `ReelCard`.

---

## 19. `ReelCard` Component

Props:

```ts
type ReelCardProps = {
  video: Video;
  isActive: boolean;
  registerVideoRef: (videoId: number, element: HTMLVideoElement | null) => void;
};
```

Implementation sketch:

```tsx
import { resolveMediaUrl } from "../api";
import type { Video } from "../types";

export function ReelCard({
  video,
  isActive,
  registerVideoRef,
}: ReelCardProps) {
  return (
    <section className="reel-card" aria-hidden={!isActive}>
      <video
        ref={(element) => registerVideoRef(video.id, element)}
        src={resolveMediaUrl(video.video_url)}
        playsInline
        muted
        loop
        controls={isActive}
        preload={isActive ? "auto" : "metadata"}
      />

      <div className="reel-overlay">
        <div className="reel-username">@{video.username}</div>
        <div className="reel-created-at">
          {new Date(video.created_at).toLocaleString()}
        </div>
      </div>
    </section>
  );
}
```

---

## 20. `ReelsFeed` Component Full Behavior

Props:

```ts
type ReelsFeedProps = {
  refreshToken: number;
};
```

Effects:

1. On mount and when `refreshToken` changes:
   - Fetch first page.
   - Set videos.
   - Set offset.
   - Set hasMore.
   - Reset activeIndex to 0.

2. Whenever `activeIndex` or videos change:
   - Play active video.
   - Pause inactive videos.

3. Keyboard listeners:
   - ArrowDown/PageDown => next.
   - ArrowUp/PageUp => prev.

Empty state:

```text
No reels yet. Create the first one.
```

End state:

```text
You're all caught up.
```

Loading states:

```text
Loading feed...
Loading more...
```

---

## 21. Frontend Styling Requirements

Create `frontend/src/styles.css`.

Use a simple polished layout.

### 21.1 App layout

```css
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: #f4f4f5;
  color: #18181b;
}

.app-shell {
  min-height: 100vh;
  padding: 24px;
}

.top-bar {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 24px;
}

.main-grid {
  display: grid;
  grid-template-columns: minmax(280px, 420px) minmax(360px, 1fr);
  gap: 24px;
}

.panel {
  background: white;
  border: 1px solid #e4e4e7;
  border-radius: 16px;
  padding: 16px;
}
```

### 21.2 Reels layout

```css
.reels-viewport {
  height: 80vh;
  overflow: hidden;
  position: relative;
  background: #09090b;
  border-radius: 16px;
  overscroll-behavior: contain;
  touch-action: none;
}

.reels-track {
  height: 100%;
  transition: transform 220ms ease-out;
  will-change: transform;
}

.reel-card {
  height: 80vh;
  width: 100%;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #09090b;
}

.reel-card video {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.reel-overlay {
  position: absolute;
  left: 20px;
  bottom: 20px;
  color: white;
  text-shadow: 0 1px 8px rgba(0, 0, 0, 0.8);
}

.reel-username {
  font-weight: 700;
  margin-bottom: 4px;
}

.reel-created-at {
  font-size: 14px;
  opacity: 0.85;
}
```

### 21.3 Mobile layout

```css
@media (max-width: 800px) {
  .app-shell {
    padding: 12px;
  }

  .main-grid {
    grid-template-columns: 1fr;
  }

  .reels-viewport,
  .reel-card {
    height: 72vh;
  }
}
```

---

## 22. Frontend Edge Cases

Handle these explicitly:

### 22.1 No selected user

- Disable recording controls.
- Disable upload controls.
- Show message:

```text
Select or create a user before posting.
```

### 22.2 Camera unsupported

Show:

```text
Camera recording is not supported in this browser.
```

### 22.3 Permission denied

Show:

```text
Could not access camera or microphone.
```

### 22.4 No videos

Show:

```text
No reels yet. Create the first one.
```

### 22.5 At first video

If user swipes up on first video:

- No-op.
- Stay on first video.

### 22.6 At last video with no more feed

If user swipes down on last video and no more videos:

- No-op.
- Optionally show “You’re all caught up.”

### 22.7 At last video with more feed

If user swipes down on last loaded video and `hasMore = true`:

- Fetch more videos.
- If videos returned, advance to first newly loaded video.

### 22.8 Rapid wheel events

Wheel events can fire many times per gesture.

Use a cooldown:

```ts
const WHEEL_COOLDOWN_MS = 400;
```

### 22.9 Rapid swipes during transition

If `isTransitioning` is true, ignore additional swipe/wheel navigation.

Optional:

```ts
if (isTransitioning) return;
```

### 22.10 Object URL cleanup

Whenever preview URL changes or component unmounts:

```ts
URL.revokeObjectURL(previewUrl)
```

### 22.11 Media stream cleanup

On recording stop or component unmount:

```ts
stream.getTracks().forEach(track => track.stop())
```

---

## 23. Backend Edge Cases

Handle these explicitly:

### 23.1 Duplicate username

Return 409.

### 23.2 Invalid username

Return 400.

### 23.3 Upload with nonexistent user

Return 404.

### 23.4 Empty file

Return 400.

### 23.5 Unsupported media type

Return 415.

### 23.6 Oversized file

Return 413 and delete partial file.

### 23.7 DB failure after file save

Delete the saved file before returning 500.

### 23.8 Static file serving

Ensure video files are accessible from returned `video_url`.

---

## 24. Docker Setup

### 24.1 Root `docker-compose.yml`

```yaml
services:
  backend:
    build:
      context: ./backend
    ports:
      - "8000:8000"
    volumes:
      - ./backend/media:/app/media
      - ./backend/app.db:/app/app.db

  frontend:
    build:
      context: ./frontend
    ports:
      - "5173:5173"
    environment:
      - VITE_API_BASE_URL=http://localhost:8000
    depends_on:
      - backend
```

### 24.2 `backend/Dockerfile`

```dockerfile
FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
RUN mkdir -p media/videos

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### 24.3 `frontend/Dockerfile`

```dockerfile
FROM node:22-slim

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
```

---

## 25. Backend Requirements

Create `backend/requirements.txt`.

```text
fastapi
uvicorn[standard]
sqlalchemy
python-multipart
pydantic
```

---

## 26. Frontend Package Requirements

Create Vite app with:

```bash
npm create vite@latest frontend -- --template react-ts
```

Required packages:

```bash
npm install
```

No additional frontend dependencies are required for MVP.

---

## 27. Local Development Commands

### 27.1 Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Backend should run at:

```text
http://localhost:8000
```

### 27.2 Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend should run at:

```text
http://localhost:5173
```

### 27.3 Docker

```bash
docker compose up --build
```

---

## 28. Manual Test Plan

### 28.1 User tests

1. Start app.
2. Confirm no user is selected.
3. Create username `josh`.
4. Confirm `josh` is selected.
5. Refresh page.
6. Confirm `josh` is restored.
7. Create username `alex`.
8. Switch between `josh` and `alex`.
9. Attempt duplicate `josh`.
10. Confirm duplicate is rejected.

### 28.2 Upload tests

1. Select user.
2. Upload a valid MP4/WebM under 50 MB.
3. Confirm it appears in feed.
4. Upload unsupported file type.
5. Confirm error.
6. Upload file over 50 MB.
7. Confirm frontend rejects it.
8. If bypassing frontend, confirm backend rejects it.

### 28.3 Recording tests

1. Select user.
2. Click start recording.
3. Grant camera/mic permission.
4. Confirm recording starts.
5. Stop before 30 seconds.
6. Preview recording.
7. Post recording.
8. Confirm it appears in feed.
9. Start another recording.
10. Let it run past 30 seconds.
11. Confirm it auto-stops.

### 28.4 Feed navigation tests

1. Create/upload at least three videos.
2. Confirm newest video appears first.
3. Confirm only first video is active.
4. Swipe down.
5. Confirm app advances exactly one video.
6. Confirm no 50/50 partial state.
7. Swipe up.
8. Confirm app returns exactly one video.
9. Press ArrowDown.
10. Confirm next video.
11. Press ArrowUp.
12. Confirm previous video.
13. On first video, swipe up.
14. Confirm no-op.
15. On last video, swipe down.
16. If no more videos, confirm no-op or “all caught up.”
17. Confirm only active video plays.
18. Confirm inactive videos pause.

---

## 29. Implementation Phases for CODEX

### Phase 1: Backend skeleton

Tasks:

1. Create backend folder structure.
2. Add FastAPI app.
3. Add CORS.
4. Add SQLite / SQLAlchemy setup.
5. Add health check.
6. Create DB tables on startup.
7. Mount static media directory.

Acceptance criteria:

- `uvicorn app.main:app --reload --port 8000` starts.
- `GET /api/health` returns `{ "ok": true }`.

---

### Phase 2: Users API

Tasks:

1. Implement `User` model.
2. Implement `UserCreate` and `UserOut`.
3. Implement username normalization.
4. Implement `GET /api/users`.
5. Implement `POST /api/users`.
6. Add duplicate username handling.

Acceptance criteria:

- Can create users.
- Can list users.
- Duplicate usernames return 409.
- Invalid usernames return 400.

---

### Phase 3: Video API

Tasks:

1. Implement `Video` model.
2. Implement video schemas.
3. Implement storage helpers.
4. Implement upload route.
5. Implement static file serving.
6. Implement feed route.

Acceptance criteria:

- Can upload valid videos.
- Files are saved in `backend/media/videos`.
- Video metadata is stored in DB.
- Feed returns newest-first videos with username and playable URL.
- Oversized and unsupported uploads are rejected.

---

### Phase 4: Frontend skeleton

Tasks:

1. Create Vite React TypeScript app.
2. Add `types.ts`.
3. Add `api.ts`.
4. Add basic app layout and CSS.
5. Confirm frontend can reach backend.

Acceptance criteria:

- Frontend runs at `localhost:5173`.
- Backend API calls work from frontend.

---

### Phase 5: User switcher

Tasks:

1. Build `UserSwitcher`.
2. Fetch users on load.
3. Create new users.
4. Select existing users.
5. Persist selected user ID in localStorage.
6. Restore selected user on refresh.

Acceptance criteria:

- User can create and switch users.
- Selected user persists across refresh.
- Creation controls depend on selected user.

---

### Phase 6: Creation UI

Tasks:

1. Build `CreateVideo`.
2. Implement file upload flow.
3. Implement file validation.
4. Implement client duration metadata check.
5. Implement camera recording flow.
6. Implement 30-second auto-stop.
7. Implement preview/discard/post.
8. Clean up streams and object URLs.

Acceptance criteria:

- User can upload video.
- User can record video.
- Recording stops at 30 seconds.
- Preview works.
- Post sends file to backend.
- Posted video refreshes feed.

---

### Phase 7: Reels feed with discrete navigation

Tasks:

1. Build `ReelsFeed`.
2. Build `ReelCard`.
3. Fetch initial feed.
4. Render full-height active video cards.
5. Use `activeIndex` as source of truth.
6. Use transform-based navigation.
7. Implement touch swipe down/up.
8. Implement wheel down/up.
9. Implement keyboard navigation.
10. Implement active-only playback.
11. Implement load-more when navigating past loaded end.

Acceptance criteria:

- One video is active at a time.
- User cannot rest between videos.
- Swipe down moves to next video.
- Swipe up moves to previous video.
- ArrowDown/PageDown moves next.
- ArrowUp/PageUp moves previous.
- Only active video plays.
- Feed order is chronological newest-first.

---

### Phase 8: Docker and README

Tasks:

1. Add backend Dockerfile.
2. Add frontend Dockerfile.
3. Add root docker-compose.
4. Add README commands.
5. Document known tradeoffs.

Acceptance criteria:

- `docker compose up --build` runs the app.
- README explains local and Docker setup.
- README explains MVP behavior and tradeoffs.

---

## 30. Production Tradeoffs to Mention

### 30.1 Filesystem storage

MVP:

```text
Local filesystem.
```

Production:

```text
S3/GCS + CDN.
```

### 30.2 Raw uploads

MVP:

```text
Serve original files.
```

Production:

```text
Transcode, normalize codecs, generate thumbnails, use adaptive bitrate streaming.
```

### 30.3 Feed

MVP:

```text
Global chronological feed.
```

Production:

```text
Personalized ranking based on follows, engagement, watch time, freshness, content safety, and creator diversity.
```

### 30.4 Pagination

MVP:

```text
Offset pagination.
```

Production:

```text
Cursor pagination using `(created_at, id)` for stable pagination under new inserts.
```

### 30.5 Auth

MVP:

```text
Dropdown account switching.
```

Production:

```text
Real auth, sessions, authorization, abuse prevention.
```

### 30.6 Video validation

MVP:

```text
Frontend duration check plus backend size/type check.
```

Production:

```text
Backend media probing, transcoding pipeline, malware scanning, moderation, and quota enforcement.
```

### 30.7 Feed navigation

MVP:

```text
Transform-based active index.
```

Production:

```text
Preload next/previous videos, manage memory, adaptive quality, watch-time tracking, and analytics events.
```

---

## 31. MVP Definition of Done

The implementation is complete when:

- Backend starts successfully.
- Frontend starts successfully.
- A user can create a username.
- A user can select an existing username from a dropdown.
- Selected user persists across refresh.
- A user can upload a video file.
- A user can record a video from camera.
- Recordings auto-stop at 30 seconds.
- Uploaded files are limited to 50 MB.
- Videos are stored on the backend.
- Feed returns videos newest-first.
- Feed displays reels one at a time.
- Swipe down moves to the next video.
- Swipe up moves to the previous video.
- Keyboard navigation works.
- The UI never rests halfway between videos.
- Only the active video plays.
- Inactive videos pause.
- App can run through Docker Compose.
- README includes setup and test instructions.
