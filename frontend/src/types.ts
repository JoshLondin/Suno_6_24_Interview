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
