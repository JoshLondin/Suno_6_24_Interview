import { useEffect, useState } from "react";

import { fetchUserVideos, resolveMediaUrl } from "../api";
import type { Video } from "../types";

type UserReelsGridProps = {
  userId: number;
  viewerUserId?: number;
};

const PAGE_SIZE = 12;

export function UserReelsGrid({ userId, viewerUserId }: UserReelsGridProps) {
  const [videos, setVideos] = useState<Video[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    fetchUserVideos(userId, PAGE_SIZE, 0, viewerUserId)
      .then((response) => {
        if (!active) return;
        setVideos(response.items);
        setOffset(response.next_offset);
        setHasMore(response.has_more);
      })
      .catch((caught) => {
        if (active) {
          setError(caught instanceof Error ? caught.message : "Failed to load user loops");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [userId, viewerUserId]);

  async function loadMore() {
    if (loading || !hasMore) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetchUserVideos(userId, PAGE_SIZE, offset, viewerUserId);
      setVideos((current) => [...current, ...response.items]);
      setOffset(response.next_offset);
      setHasMore(response.has_more);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to load more loops");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="profile-reels-section">
      {error && <p className="error-message" role="alert">{error}</p>}
      {videos.length === 0 && !loading && (
        <p className="profile-empty-state">This user has not posted any loops yet.</p>
      )}
      <div className="profile-reels-grid">
        {videos.map((video) => (
          <article key={video.id} className="profile-reel-tile">
            <video
              src={resolveMediaUrl(video.video_url)}
              muted
              playsInline
              controls
              preload="metadata"
            />
            <div className="profile-reel-meta">
              <span>♥ {video.like_count}</span>
              <span>💬 {video.comment_count}</span>
            </div>
          </article>
        ))}
      </div>
      {loading && <p className="profile-loading">Loading loops…</p>}
      {hasMore && (
        <button type="button" className="wide-button" onClick={loadMore} disabled={loading}>
          Load more
        </button>
      )}
    </div>
  );
}
