"use client";

import { useState } from "react";

/** First-run gate: a new User must pick a nickname before entering the app. It's how they
 * appear in the Feed, roster and leaderboard, so we ask up front instead of leaking their email.
 * Non-dismissable — clears only once useMyName saves the name. */
export function NicknameOnboarding({ onSave }: { onSave: (name: string) => Promise<void> }) {
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const next = draft.trim();
    if (next.length < 2) return setError("Pick at least 2 characters.");
    setError(null);
    setSaving(true);
    try {
      await onSave(next);
    } catch {
      setSaving(false);
      setError("Couldn’t save that — try again.");
    }
  }

  return (
    <div className="onboard-overlay" role="dialog" aria-modal="true" aria-labelledby="onboard-title">
      <div className="onboard-card">
        <div className="onboard-head">
          <h1 id="onboard-title" style={{ margin: 0 }}>Pick your nickname</h1>
        </div>
        <div className="onboard-body">
          <p className="muted" style={{ margin: 0 }}>
            It’s how your mates see you — in the Feed, the leaderboard, everywhere. Change it anytime
            in your Profile.
          </p>
          <form className="onboard-form" onSubmit={submit}>
            <label className="sr-only" htmlFor="onboard-nick">Nickname</label>
            <input
              id="onboard-nick"
              value={draft}
              autoFocus
              maxLength={24}
              autoComplete="off"
              placeholder="e.g. Gaffer, KingKenny…"
              aria-invalid={!!error}
              aria-describedby={error ? "onboard-error" : undefined}
              onChange={(e) => setDraft(e.target.value)}
            />
            <button type="submit" disabled={saving || draft.trim().length < 2}>
              {saving ? "Saving…" : "Continue →"}
            </button>
          </form>
          {error && <p className="error" id="onboard-error" style={{ margin: 0 }}>{error}</p>}
        </div>
      </div>
    </div>
  );
}
