import { useEffect, useRef, useState, type ChangeEvent } from "react";

import {
  fetchUserProfile,
  resolveMediaUrl,
  updateUserProfile,
  uploadProfilePhoto,
} from "../api";
import type { User, UserProfile } from "../types";
import { UserReelsGrid } from "./UserReelsGrid";

type ProfilePanelProps = {
  userId: number;
  currentUser: User;
  onClose: () => void;
  onUserUpdated: (user: User) => void;
};

export function ProfilePanel({
  userId,
  currentUser,
  onClose,
  onUserUpdated,
}: ProfilePanelProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    fetchUserProfile(userId)
      .then((loaded) => {
        if (!active) return;
        setProfile(loaded);
        setDescription(loaded.description ?? "");
      })
      .catch((caught) => {
        if (active) {
          setError(caught instanceof Error ? caught.message : "Failed to load profile");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [userId]);

  async function handleSaveProfile() {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateUserProfile(userId, description);
      setProfile(updated);
      setDescription(updated.description ?? "");
      onUserUpdated(updated);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to save profile");
    } finally {
      setSaving(false);
    }
  }

  async function handlePhotoSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setSaving(true);
    setError(null);
    try {
      const updated = await uploadProfilePhoto(userId, file);
      setProfile(updated);
      onUserUpdated(updated);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to upload profile photo");
    } finally {
      setSaving(false);
    }
  }

  const shownProfile = profile;

  return (
    <div
      className="profile-panel-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        className="profile-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-panel-heading"
      >
        <div className="profile-panel-heading">
          <div>
            <p className="eyebrow">ACCOUNT</p>
            <h2 id="profile-panel-heading">Profile</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close profile">
            ×
          </button>
        </div>

        {loading && <p className="profile-loading">Loading profile…</p>}
        {error && <p className="error-message" role="alert">{error}</p>}

        {shownProfile && (
          <>
            <div className="profile-header">
              {shownProfile.profile_photo_url ? (
                <img
                  className="profile-avatar-large"
                  src={resolveMediaUrl(shownProfile.profile_photo_url)}
                  alt={`${shownProfile.username} profile`}
                />
              ) : (
                <div className="profile-avatar-large profile-avatar-placeholder">
                  {shownProfile.username.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div>
                <h3>@{shownProfile.username}</h3>
                <p>{shownProfile.video_count} loops posted</p>
              </div>
            </div>

            <label className="profile-upload-control">
              Profile photo
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handlePhotoSelected}
                disabled={saving}
              />
            </label>

            <label className="profile-description-control">
              Description
              <textarea
                maxLength={280}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Tell people what you’re making…"
              />
            </label>
            <div className="profile-save-row">
              <span>{description.length} / 280</span>
              <button type="button" onClick={handleSaveProfile} disabled={saving}>
                {saving ? "Saving…" : "Save Profile"}
              </button>
            </div>

            <div className="profile-reels-heading">
              <h3>Posted Loops</h3>
            </div>
            <UserReelsGrid userId={shownProfile.id} viewerUserId={currentUser.id} />
          </>
        )}
      </aside>
    </div>
  );
}
