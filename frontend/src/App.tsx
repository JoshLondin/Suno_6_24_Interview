import { useEffect, useState } from "react";

import { fetchHealth, fetchUsers } from "./api";
import { CreateVideo } from "./components/CreateVideo";
import { ReelsFeed } from "./components/ReelsFeed";
import { UserSwitcher } from "./components/UserSwitcher";
import type { User } from "./types";

const CURRENT_USER_KEY = "currentUserId";

export function App() {
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [feedRefreshToken, setFeedRefreshToken] = useState(0);
  const [postModalOpen, setPostModalOpen] = useState(false);

  useEffect(() => {
    fetchHealth().then(setApiOnline).catch(() => setApiOnline(false));
    fetchUsers()
      .then((loadedUsers) => {
        setUsers(loadedUsers);
        const savedId = Number(localStorage.getItem(CURRENT_USER_KEY));
        const restored = loadedUsers.find((user) => user.id === savedId);
        if (restored) setCurrentUser(restored);
      })
      .catch((error: unknown) => {
        setUsersError(error instanceof Error ? error.message : "Could not load users");
      });
  }, []);

  function chooseUser(user: User) {
    setCurrentUser(user);
    localStorage.setItem(CURRENT_USER_KEY, String(user.id));
  }

  useEffect(() => {
    if (!postModalOpen) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setPostModalOpen(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [postModalOpen]);

  function handleVideoPosted() {
    setFeedRefreshToken((value) => value + 1);
    setPostModalOpen(false);
  }

  return (
    <div className="app-shell">
      <header className="top-nav">
        <div className="brand-lockup">
          <p className="eyebrow">SHORT-FORM VIDEO</p>
          <h1>Loop</h1>
        </div>
        <div className="nav-actions">
          <UserSwitcher
            users={users}
            currentUser={currentUser}
            onUsersChange={setUsers}
            onCurrentUserChange={chooseUser}
            variant="nav"
          />
          <button
            className="post-loop-button"
            type="button"
            onClick={() => setPostModalOpen(true)}
          >
            Post a Loop
          </button>
          <span className={`api-status ${apiOnline ? "online" : ""}`}>
            {apiOnline === null ? "Connecting…" : apiOnline ? "API online" : "API offline"}
          </span>
        </div>
      </header>
      {usersError && <p className="top-error error-message" role="alert">{usersError}</p>}
      <main className="feed-main">
        <ReelsFeed refreshToken={feedRefreshToken} />
      </main>

      {postModalOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPostModalOpen(false);
          }}
        >
          <section
            className="post-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="post-modal-heading"
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">CREATE</p>
                <h2 id="post-modal-heading">Post a Loop</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={() => setPostModalOpen(false)}
                aria-label="Close post modal"
              >
                ×
              </button>
            </div>
            <CreateVideo
              currentUser={currentUser}
              onVideoPosted={handleVideoPosted}
            />
          </section>
        </div>
      )}
    </div>
  );
}
