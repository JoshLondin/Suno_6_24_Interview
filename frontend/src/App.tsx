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

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div>
          <p className="eyebrow">SHORT-FORM VIDEO</p>
          <h1>Loop</h1>
        </div>
        <span className={`api-status ${apiOnline ? "online" : ""}`}>
          {apiOnline === null ? "Connecting…" : apiOnline ? "API online" : "API offline"}
        </span>
      </header>
      <main className="main-grid">
        <aside className="panel">
          <UserSwitcher
            users={users}
            currentUser={currentUser}
            onUsersChange={setUsers}
            onCurrentUserChange={chooseUser}
          />
          {usersError && <p className="error-message" role="alert">{usersError}</p>}
          <CreateVideo
            currentUser={currentUser}
            onVideoPosted={() => setFeedRefreshToken((value) => value + 1)}
          />
        </aside>
        <section className="panel feed-panel">
          <ReelsFeed refreshToken={feedRefreshToken} />
        </section>
      </main>
    </div>
  );
}
