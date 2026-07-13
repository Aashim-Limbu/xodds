"use client";

import { useEffect, useRef, useState } from "react";
import { type FeedApi } from "@/lib/feed";

const REACTIONS = ["🔥", "😂", "😱", "⚽", "💸"];

/** The live per-Pool Feed: presence, auto-posted actions, messages, and reactions. */
export function Feed({ feed }: { feed: FeedApi }) {
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [feed.events.length]);

  if (!feed.enabled) {
    return (
      <div className="panel muted">
        Set <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to
        turn on the live Feed (see <code>.env.example</code>).
      </div>
    );
  }

  return (
    <div className="panel stack" style={{ gap: 12 }}>
      <div className="chat-header">
        <h2>Live Chat</h2>
        <span className="chat-presence">
          👀 {feed.present.length} watching{feed.ready ? "" : " · connecting…"}
        </span>
      </div>

      <div className="feed-scroll stack">
        {feed.events.length === 0 && <span className="muted">No activity yet — say something.</span>}
        {feed.events.map((e) =>
          e.kind === "system" ? (
            <div key={e.id} className="feed-system">{e.text}</div>
          ) : e.kind === "reaction" ? (
            <div key={e.id} className="feed-reaction"><strong>{e.author}</strong> {e.text}</div>
          ) : (
            <div key={e.id} className="feed-msg">
              <strong>{e.author}</strong> {e.text}
            </div>
          ),
        )}
        <div ref={endRef} />
      </div>

      <div className="row" style={{ gap: 6 }}>
        {REACTIONS.map((r) => (
          <button key={r} className="secondary reaction-btn" disabled={!feed.ready} onClick={() => feed.sendReaction(r)}>
            {r}
          </button>
        ))}
      </div>

      <form
        className="row"
        onSubmit={(ev) => {
          ev.preventDefault();
          feed.sendMessage(draft);
          setDraft("");
        }}
      >
        <input
          style={{ flex: 1 }}
          value={draft}
          placeholder="Message your Group…"
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit" disabled={!feed.ready}>Send</button>
      </form>
    </div>
  );
}
