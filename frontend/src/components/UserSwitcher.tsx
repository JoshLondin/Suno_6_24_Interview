import { useState, type FormEvent } from "react";

import { createUser } from "../api";
import type { User } from "../types";

type UserSwitcherProps = {
  users: User[];
  currentUser: User | null;
  onUsersChange: (users: User[]) => void;
  onCurrentUserChange: (user: User) => void;
};

export function UserSwitcher({
  users,
  currentUser,
  onUsersChange,
  onCurrentUserChange,
}: UserSwitcherProps) {
  const [newUsername, setNewUsername] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function selectUser(id: string) {
    const user = users.find((candidate) => candidate.id === Number(id));
    if (user) onCurrentUserChange(user);
  }

  async function handleCreateUser(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const created = await createUser(newUsername);
      onUsersChange(
        [...users, created].sort((a, b) => a.username.localeCompare(b.username)),
      );
      onCurrentUserChange(created);
      setNewUsername("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to create user");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="account-section" aria-labelledby="account-heading">
      <div className="section-heading">
        <div>
          <p className="step-label">01 / ACCOUNT</p>
          <h2 id="account-heading">Who’s posting?</h2>
        </div>
        {currentUser && <span className="avatar">{currentUser.username[0]}</span>}
      </div>

      <label htmlFor="user-select">Current account</label>
      <select
        id="user-select"
        value={currentUser?.id ?? ""}
        onChange={(event) => selectUser(event.target.value)}
      >
        <option value="" disabled>Select a user</option>
        {users.map((user) => (
          <option key={user.id} value={user.id}>@{user.username}</option>
        ))}
      </select>

      <div className="divider"><span>or create one</span></div>

      <form onSubmit={handleCreateUser} className="create-user-form">
        <label htmlFor="new-username">New username</label>
        <div className="input-row">
          <span aria-hidden="true">@</span>
          <input
            id="new-username"
            value={newUsername}
            onChange={(event) => setNewUsername(event.target.value)}
            placeholder="your_handle"
            minLength={3}
            maxLength={30}
            pattern="[a-zA-Z0-9_-]+"
            required
          />
          <button type="submit" disabled={submitting}>
            {submitting ? "Creating…" : "Create"}
          </button>
        </div>
      </form>

      {error && <p className="error-message" role="alert">{error}</p>}
    </section>
  );
}
