import { useEffect, useState } from "react";

import { fetchHealth } from "./api";

export function App() {
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);

  useEffect(() => {
    fetchHealth().then(setApiOnline).catch(() => setApiOnline(false));
  }, []);

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
          <h2>Create</h2>
          <p>User switching and creation controls are coming next.</p>
        </aside>
        <section className="panel feed-placeholder">
          <h2>Your feed</h2>
          <p>Fresh reels will appear here.</p>
        </section>
      </main>
    </div>
  );
}
