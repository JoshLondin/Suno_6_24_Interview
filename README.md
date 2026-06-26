# Loop

A lightweight, local-first short-form video app inspired by Reels and TikTok. Users can create a handle, switch between local accounts, upload or record a clip up to 30 seconds, and watch a newest-first feed one reel at a time.

## What it does

- Creates and switches lightweight accounts without passwords
- Restores the selected account after refresh
- Records camera and microphone video with a 30-second automatic cutoff
- Uploads WebM, MP4, and MOV files up to 50 MB
- Checks upload duration in the browser when metadata is available
- Streams uploads to disk while enforcing the size limit on the backend
- Shows a newest-first, paginated feed
- Moves exactly one reel per touch, wheel, or keyboard gesture
- Plays only the active reel and pauses/resets all inactive reels

The product deliberately follows the prompt's gesture direction: swipe down advances; swipe up returns to the previous reel. ArrowDown/PageDown and ArrowUp/PageUp mirror those actions.

## Stack

- React, TypeScript, Vite, plain CSS
- FastAPI, SQLAlchemy, Pydantic, SQLite
- Local video storage in `backend/media/videos`
- Docker Compose for a two-service local environment

## Run locally

Requirements: Python 3.10+ and Node 20+.

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

The API is at [http://localhost:8000](http://localhost:8000). Check it with:

```bash
curl http://localhost:8000/api/health
```

### Frontend

In another terminal:

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

To point the frontend somewhere else, set `VITE_API_BASE_URL` before starting Vite.

## Run with Docker

```bash
docker compose up --build
```

Then open [http://localhost:5173](http://localhost:5173). SQLite data is kept in the `backend_data` named volume; videos are written to `backend/media/videos` on the host.

Stop the app with `docker compose down`. Add `-v` only when you intentionally want to remove the database volume.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Service health |
| `GET` | `/api/users` | Alphabetical user list |
| `POST` | `/api/users` | Create a normalized, unique username |
| `GET` | `/api/users/{user_id}` | Get account profile and posted loop count |
| `PATCH` | `/api/users/{user_id}/profile` | Update profile description |
| `POST` | `/api/users/{user_id}/profile-photo` | Upload JPEG, PNG, or WebP profile photo up to 5 MB |
| `GET` | `/api/users/{user_id}/videos?limit=20&offset=0&viewer_user_id=1` | Newest-first loops for one account |
| `POST` | `/api/videos` | Upload multipart fields `user_id` and `video` |
| `GET` | `/api/videos/feed?limit=20&offset=0&viewer_user_id=1` | Newest-first feed page with social state |
| `POST` | `/api/videos/{video_id}/like` | Like a loop as `{ "user_id": 1 }` |
| `DELETE` | `/api/videos/{video_id}/like?user_id=1` | Unlike a loop |
| `GET` | `/api/videos/{video_id}/comments?limit=50&offset=0` | List loop comments oldest-first |
| `POST` | `/api/videos/{video_id}/comments` | Add a comment as `{ "user_id": 1, "body": "..." }` |
| `GET` | `/media/videos/{filename}` | Serve stored video |
| `GET` | `/media/profile_photos/{filename}` | Serve stored profile photo |

Usernames must be 3–30 letters, numbers, underscores, or hyphens. They are trimmed and preserve casing.

If you are iterating on schema locally with SQLite, delete `backend/app.db` before restarting the backend so SQLAlchemy can recreate tables and columns with the latest schema.

## Verification

Build the frontend:

```bash
cd frontend
npm run build
```

Suggested product smoke test:

1. Create two usernames, switch between them, and refresh to confirm restoration.
2. Upload a valid clip under 30 seconds and confirm it appears at the top of the feed.
3. Reject an unsupported file, a clip over 50 MB, and (when readable) a clip over 30 seconds.
4. Record a camera clip, preview it, discard it, then record and post another.
5. With three clips, test swipe, wheel, arrow, and page-key navigation in both directions.
6. Confirm the viewport always settles on one full reel and only that reel plays.
7. Navigate beyond the initial 20 clips to exercise feed pagination.

Camera recording requires browser permission and a secure context; `localhost` is treated as secure by modern browsers.

## MVP tradeoffs

This implementation optimizes for a clear interview-sized product rather than production media infrastructure:

- Files live on one local filesystem. Production would use object storage plus a CDN.
- Original uploads are served directly. Production would probe, scan, moderate, transcode, thumbnail, and publish adaptive HLS/DASH renditions.
- Duration is checked on the client, while the server authoritatively checks MIME type and streamed size. Production would use server-side media probing.
- The feed is global, chronological, and offset-paginated. Production would use stable cursor pagination and a ranking system.
- Account switching is intentionally not authentication. Production would add identity, sessions, authorization, rate limits, and abuse controls.
- The browser loads standard video files. Production would preload adjacent renditions and add bandwidth, memory, watch-time, and playback analytics policies.

## Repository layout

```text
backend/
  app/                FastAPI routes, models, schemas, and storage
  media/videos/       Local uploaded video files
frontend/
  src/components/     Account, creation, and reels UI
docker-compose.yml
```
