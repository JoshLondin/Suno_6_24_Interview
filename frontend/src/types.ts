export type User = {
  id: number;
  username: string;
  profile_photo_url: string | null;
  description: string | null;
  created_at: string;
};

export type UserProfile = User & {
  video_count: number;
};

export type Video = {
  id: number;
  user_id: number;
  username: string;
  user_profile_photo_url: string | null;
  video_url: string;
  content_type: string;
  file_size_bytes: number;
  duration_seconds: number | null;
  created_at: string;
  like_count: number;
  liked_by_current_user: boolean;
  comment_count: number;
};

export type FeedResponse = {
  items: Video[];
  next_offset: number;
  has_more: boolean;
};

export type LikeResponse = {
  video_id: number;
  liked: boolean;
  like_count: number;
};

export type Comment = {
  id: number;
  video_id: number;
  user_id: number;
  username: string;
  user_profile_photo_url: string | null;
  body: string;
  created_at: string;
};

export type CommentListResponse = {
  items: Comment[];
  next_offset: number;
  has_more: boolean;
};
