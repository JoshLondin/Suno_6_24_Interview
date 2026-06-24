import { resolveMediaUrl } from "../api";
import type { Video } from "../types";

type ReelCardProps = {
  video: Video;
  isActive: boolean;
  position: number;
  total: number;
  registerVideoRef: (videoId: number, element: HTMLVideoElement | null) => void;
};

export function ReelCard({
  video,
  isActive,
  position,
  total,
  registerVideoRef,
}: ReelCardProps) {
  return (
    <article className="reel-card" aria-hidden={!isActive}>
      <video
        ref={(element) => registerVideoRef(video.id, element)}
        src={resolveMediaUrl(video.video_url)}
        playsInline
        muted
        loop
        controls={isActive}
        preload={isActive ? "auto" : "metadata"}
        tabIndex={isActive ? 0 : -1}
      />
      <div className="reel-gradient" />
      <div className="reel-overlay">
        <p className="reel-count">{String(position).padStart(2, "0")} / {String(total).padStart(2, "0")}</p>
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
    </article>
  );
}
