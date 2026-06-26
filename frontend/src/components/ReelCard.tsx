import { resolveMediaUrl } from "../api";
import type { User, Video } from "../types";

type ReelCardProps = {
  video: Video;
  isActive: boolean;
  position: number;
  total: number;
  currentUser: User | null;
  registerVideoRef: (videoId: number, element: HTMLVideoElement | null) => void;
  onToggleLike: (video: Video) => void;
  onOpenComments?: (video: Video) => void;
};

export function ReelCard({
  video,
  isActive,
  position,
  total,
  currentUser,
  registerVideoRef,
  onToggleLike,
  onOpenComments,
}: ReelCardProps) {
  return (
    <article className="reel-card" aria-hidden={!isActive}>
      <video
        ref={(element) => registerVideoRef(video.id, element)}
        src={resolveMediaUrl(video.video_url)}
        playsInline
        loop
        controls={isActive}
        preload={isActive ? "auto" : "metadata"}
        tabIndex={isActive ? 0 : -1}
      />
      <div className="reel-gradient" />
      <div className="reel-overlay">
        <p className="reel-count">{String(position).padStart(2, "0")} / {String(total).padStart(2, "0")}</p>
        <div className="reel-meta">
          <h3>@{video.username}</h3>
          <time dateTime={video.created_at}>
            {new Date(video.created_at).toLocaleString(undefined, {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </time>
        </div>
      </div>
      <div className="reel-actions" aria-label="Loop actions">
        <button
          type="button"
          disabled={!currentUser}
          onClick={() => onToggleLike(video)}
          aria-label={video.liked_by_current_user ? "Unlike loop" : "Like loop"}
          className={video.liked_by_current_user ? "is-liked" : ""}
        >
          {video.liked_by_current_user ? "♥" : "♡"}
        </button>
        <span>{video.like_count}</span>
        <button
          type="button"
          onClick={() => onOpenComments?.(video)}
          aria-label="Open comments"
        >
          💬
        </button>
        <span>{video.comment_count}</span>
      </div>
    </article>
  );
}
