import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type TouchEvent,
  type WheelEvent,
} from "react";

import { fetchFeed } from "../api";
import type { Video } from "../types";
import { ReelCard } from "./ReelCard";

type ReelsFeedProps = { refreshToken: number };

const PAGE_SIZE = 20;
const SWIPE_THRESHOLD_PX = 50;
const WHEEL_COOLDOWN_MS = 400;
const TRANSITION_MS = 240;

export function ReelsFeed({ refreshToken }: ReelsFeedProps) {
  const [videos, setVideos] = useState<Video[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [atEnd, setAtEnd] = useState(false);

  const videoRefs = useRef(new Map<number, HTMLVideoElement>());
  const touchStartYRef = useRef<number | null>(null);
  const lastWheelAtRef = useRef(0);
  const transitionTimerRef = useRef<number | null>(null);

  const beginTransition = useCallback(() => {
    setIsTransitioning(true);
    if (transitionTimerRef.current !== null) window.clearTimeout(transitionTimerRef.current);
    transitionTimerRef.current = window.setTimeout(() => {
      setIsTransitioning(false);
      transitionTimerRef.current = null;
    }, TRANSITION_MS);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setAtEnd(false);
    fetchFeed(PAGE_SIZE, 0)
      .then((response) => {
        if (!active) return;
        setVideos(response.items);
        setOffset(response.next_offset);
        setHasMore(response.has_more);
        setActiveIndex(0);
      })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : "Failed to load feed");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [refreshToken]);

  useEffect(() => {
    return () => {
      if (transitionTimerRef.current !== null) window.clearTimeout(transitionTimerRef.current);
    };
  }, []);

  useEffect(() => {
    videos.forEach((video, index) => {
      const element = videoRefs.current.get(video.id);
      if (!element) return;
      if (index === activeIndex) {
        element.muted = true;
        void element.play().catch(() => undefined);
      } else {
        element.pause();
        element.currentTime = 0;
      }
    });
  }, [activeIndex, videos]);

  const registerVideoRef = useCallback((videoId: number, element: HTMLVideoElement | null) => {
    if (element) videoRefs.current.set(videoId, element);
    else videoRefs.current.delete(videoId);
  }, []);

  const goToIndex = useCallback((nextIndex: number) => {
    const clamped = Math.max(0, Math.min(nextIndex, videos.length - 1));
    if (!videos.length || clamped === activeIndex || isTransitioning) return;
    setAtEnd(false);
    setActiveIndex(clamped);
    beginTransition();
  }, [activeIndex, beginTransition, isTransitioning, videos.length]);

  const loadMoreAndAdvance = useCallback(async () => {
    if (loading || !hasMore || isTransitioning) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetchFeed(PAGE_SIZE, offset);
      setVideos((current) => [...current, ...response.items]);
      setOffset(response.next_offset);
      setHasMore(response.has_more);
      if (response.items.length > 0) {
        setActiveIndex((current) => current + 1);
        beginTransition();
      } else {
        setAtEnd(true);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to load more videos");
    } finally {
      setLoading(false);
    }
  }, [beginTransition, hasMore, isTransitioning, loading, offset]);

  const goNext = useCallback(() => {
    if (isTransitioning || !videos.length) return;
    if (activeIndex < videos.length - 1) goToIndex(activeIndex + 1);
    else if (hasMore) void loadMoreAndAdvance();
    else setAtEnd(true);
  }, [activeIndex, goToIndex, hasMore, isTransitioning, loadMoreAndAdvance, videos.length]);

  const goPrev = useCallback(() => {
    if (!isTransitioning) goToIndex(activeIndex - 1);
  }, [activeIndex, goToIndex, isTransitioning]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, select, textarea, button")) return;
      if (event.key === "ArrowDown" || event.key === "PageDown") {
        event.preventDefault();
        goNext();
      } else if (event.key === "ArrowUp" || event.key === "PageUp") {
        event.preventDefault();
        goPrev();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goNext, goPrev]);

  function handleTouchStart(event: TouchEvent<HTMLDivElement>) {
    touchStartYRef.current = event.touches[0]?.clientY ?? null;
  }

  function handleTouchEnd(event: TouchEvent<HTMLDivElement>) {
    const startY = touchStartYRef.current;
    touchStartYRef.current = null;
    const endY = event.changedTouches[0]?.clientY;
    if (startY === null || endY === undefined) return;
    const deltaY = endY - startY;
    if (Math.abs(deltaY) < SWIPE_THRESHOLD_PX) return;
    if (deltaY > 0) goNext();
    else goPrev();
  }

  function handleWheel(event: WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    const now = Date.now();
    if (now - lastWheelAtRef.current < WHEEL_COOLDOWN_MS) return;
    lastWheelAtRef.current = now;
    if (event.deltaY > 0) goNext();
    else if (event.deltaY < 0) goPrev();
  }

  if (loading && videos.length === 0) return <div className="feed-state">Loading feed…</div>;
  if (error && videos.length === 0) return <div className="feed-state error-message">{error}</div>;
  if (videos.length === 0) {
    return (
      <div className="feed-state empty-feed">
        <span>◎</span>
        <h2>No reels yet</h2>
        <p>Create the first one.</p>
      </div>
    );
  }

  return (
    <section className="feed-section" aria-label="Reels feed">
      <div className="feed-heading">
        <div><p className="step-label">03 / WATCH</p><h2>Fresh loops</h2></div>
        <div className="nav-hint"><span>↓ Next</span><span>↑ Previous</span></div>
      </div>
      <div
        className="reels-viewport"
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div className="reels-track" style={{ transform: `translateY(-${activeIndex * 100}%)` }}>
          {videos.map((video, index) => (
            <ReelCard
              key={video.id}
              video={video}
              isActive={index === activeIndex}
              position={index + 1}
              total={videos.length}
              registerVideoRef={registerVideoRef}
            />
          ))}
        </div>
        <div className="reel-nav-buttons" aria-label="Feed navigation">
          <button type="button" onClick={goPrev} disabled={activeIndex === 0 || isTransitioning} aria-label="Previous reel">↑</button>
          <button type="button" onClick={goNext} disabled={isTransitioning || loading} aria-label="Next reel">↓</button>
        </div>
        {loading && <div className="feed-toast">Loading more…</div>}
        {atEnd && <div className="feed-toast">You’re all caught up.</div>}
        {error && <div className="feed-toast error-message">{error}</div>}
      </div>
    </section>
  );
}
