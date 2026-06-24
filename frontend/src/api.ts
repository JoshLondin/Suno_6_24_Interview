import type { FeedResponse, User, Video } from "./types";

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

async function parseError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: string };
    return body.detail ?? `Request failed with ${response.status}`;
  } catch {
    return `Request failed with ${response.status}`;
  }
}

export function resolveMediaUrl(videoUrl: string): string {
  return videoUrl.startsWith("http") ? videoUrl : `${API_BASE_URL}${videoUrl}`;
}

export async function fetchHealth(): Promise<boolean> {
  const response = await fetch(`${API_BASE_URL}/api/health`);
  if (!response.ok) throw new Error(await parseError(response));
  const body = (await response.json()) as { ok: boolean };
  return body.ok;
}

export async function fetchUsers(): Promise<User[]> {
  const response = await fetch(`${API_BASE_URL}/api/users`);
  if (!response.ok) throw new Error(await parseError(response));
  return response.json();
}

export async function createUser(username: string): Promise<User> {
  const response = await fetch(`${API_BASE_URL}/api/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username }),
  });
  if (!response.ok) throw new Error(await parseError(response));
  return response.json();
}

export async function fetchFeed(limit = 20, offset = 0): Promise<FeedResponse> {
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
