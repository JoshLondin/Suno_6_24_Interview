import { useEffect, useState } from "react";

import { createComment, fetchComments, resolveMediaUrl } from "../api";
import type { Comment, User, Video } from "../types";

type CommentsDrawerProps = {
  video: Video;
  currentUser: User | null;
  onClose: () => void;
  onCommentCreated: (videoId: number) => void;
};

const PAGE_SIZE = 50;

export function CommentsDrawer({
  video,
  currentUser,
  onClose,
  onCommentCreated,
}: CommentsDrawerProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [body, setBody] = useState("");
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    fetchComments(video.id, PAGE_SIZE, 0)
      .then((response) => {
        if (!active) return;
        setComments(response.items);
        setOffset(response.next_offset);
        setHasMore(response.has_more);
      })
      .catch((caught) => {
        if (active) {
          setError(caught instanceof Error ? caught.message : "Failed to load comments");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [video.id]);

  async function loadMore() {
    if (loading || !hasMore) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetchComments(video.id, PAGE_SIZE, offset);
      setComments((current) => [...current, ...response.items]);
      setOffset(response.next_offset);
      setHasMore(response.has_more);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to load more comments");
    } finally {
      setLoading(false);
    }
  }

  async function handlePostComment() {
    if (!currentUser) {
      setError("Select a user before commenting.");
      return;
    }

    const trimmed = body.trim();
    if (!trimmed) {
      setError("Comment cannot be empty.");
      return;
    }

    setPosting(true);
    setError(null);
    try {
      const created = await createComment(video.id, currentUser.id, trimmed);
      setComments((current) => [...current, created]);
      setBody("");
      onCommentCreated(video.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to post comment");
    } finally {
      setPosting(false);
    }
  }

  return (
    <div
      className="comments-drawer-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        className="comments-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="comments-heading"
      >
        <div className="comments-header">
          <div>
            <p className="eyebrow">LOOP DISCUSSION</p>
            <h2 id="comments-heading">Comments</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close comments">
            ×
          </button>
        </div>

        {error && <p className="error-message" role="alert">{error}</p>}

        <div className="comments-list">
          {loading && comments.length === 0 && <p className="comments-muted">Loading comments…</p>}
          {comments.length === 0 && !loading && (
            <p className="comments-muted">No comments yet. Be the first to comment.</p>
          )}
          {comments.map((comment) => (
            <article key={comment.id} className="comment-row">
              {comment.user_profile_photo_url ? (
                <img
                  className="comment-avatar"
                  src={resolveMediaUrl(comment.user_profile_photo_url)}
                  alt=""
                />
              ) : (
                <div className="comment-avatar comment-avatar-placeholder">
                  {comment.username.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div>
                <strong>@{comment.username}</strong>
                <p>{comment.body}</p>
                <time dateTime={comment.created_at}>
                  {new Date(comment.created_at).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </time>
              </div>
            </article>
          ))}
          {hasMore && (
            <button type="button" className="wide-button" onClick={loadMore} disabled={loading}>
              Load more comments
            </button>
          )}
        </div>

        <div className="comment-composer">
          <textarea
            value={body}
            maxLength={500}
            placeholder={
              currentUser
                ? `Comment as @${currentUser.username}`
                : "Select a user before commenting"
            }
            disabled={!currentUser || posting}
            onChange={(event) => setBody(event.target.value)}
          />
          <div className="comment-composer-actions">
            <span>{body.length} / 500</span>
            <button
              type="button"
              disabled={!currentUser || posting || !body.trim()}
              onClick={handlePostComment}
            >
              {posting ? "Posting…" : "Post"}
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
