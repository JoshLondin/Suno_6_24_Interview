import { useEffect, useState } from "react";

import { fetchHealth, fetchUsers } from "./api";
import { UserSwitcher } from "./components/UserSwitcher";
import type { User } from "./types";

const CURRENT_USER_KEY = "currentUserId";

export function App() {
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [usersError, setUsersError] = useState<string | null>(null);

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
          <div className="creation-placeholder">
            <p className="step-label">02 / CREATE</p>
            <h2>Make a reel</h2>
            <p>
              {currentUser
                ? `Ready when you are, @${currentUser.username}.`
                : "Select or create a user before posting."}
            </p>
          </div>
        </aside>
        <section className="panel feed-placeholder">
          <h2>Your feed</h2>
          <p>Fresh reels will appear here.</p>
        </section>
      </main>
    </div>
  );
}
