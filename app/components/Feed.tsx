"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { type FeedApi, type FeedEvent } from "@/lib/feed";

const REACTIONS = ["🔥", "😂", "😱", "⚽", "💸"];

/** Classify a system event so money moments read as stamped ticket stubs, not log lines. */
function stubKind(text: string): "stake" | "win" | "settled" | "hype" {
  if (text.startsWith("💸")) return "stake";
  if (text.startsWith("🏆") || text.startsWith("🔥")) return "win";
  if (text.startsWith("✅")) return "settled";
  return "hype";
}

const timeOf = (ts: number) =>
  new Date(ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

/** One emoji's tally on a message: who reacted, and whether that includes you. */
type Tally = { emoji: string; count: number; mine: boolean };

/** Roll every targeted reaction up per message → ordered emoji tallies. Reactions are deduped
 * upstream by a deterministic id, so a Set of authors is exact. */
function tallyReactions(events: FeedEvent[], me: string): Map<string, Tally[]> {
  const byMsg = new Map<string, Map<string, Set<string>>>();
  for (const e of events) {
    if (e.kind !== "reaction" || !e.target) continue; // skip legacy free-floating reactions
    let emojis = byMsg.get(e.target);
    if (!emojis) byMsg.set(e.target, (emojis = new Map()));
    let authors = emojis.get(e.text);
    if (!authors) emojis.set(e.text, (authors = new Set()));
    authors.add(e.author);
  }
  const out = new Map<string, Tally[]>();
  for (const [msg, emojis] of byMsg) {
    out.set(
      msg,
      [...emojis.entries()].map(([emoji, authors]) => ({
        emoji,
        count: authors.size,
        mine: authors.has(me),
      })),
    );
  }
  return out;
}

/** Reaction pills + the peel-out "＋" picker that live under a message bubble. */
function Reactions({
  tallies,
  open,
  onOpen,
  onReact,
  side,
}: {
  tallies: Tally[];
  open: boolean;
  onOpen: (v: boolean) => void;
  onReact: (emoji: string) => void;
  side: "mine" | "theirs";
}) {
  return (
    <div className={`react-row ${side}`}>
      {tallies.map((t) => (
        <button
          key={t.emoji}
          className={`react-pill${t.mine ? " mine" : ""}`}
          onClick={() => onReact(t.emoji)}
          aria-pressed={t.mine}
          aria-label={`${t.emoji} ${t.count}${t.mine ? ", you reacted" : ""}`}
        >
          <span aria-hidden="true">{t.emoji}</span>
          <span className="react-count">{t.count}</span>
        </button>
      ))}
      <div className="react-add-wrap">
        <button
          className="react-add"
          aria-label="Add reaction"
          aria-expanded={open}
          onClick={() => onOpen(!open)}
        >
          <span className="msym">add_reaction</span>
        </button>
        {open && (
          <div className="react-picker" role="menu">
            {REACTIONS.map((r) => (
              <button
                key={r}
                role="menuitem"
                className="react-pick"
                aria-label={`React ${r}`}
                onClick={() => {
                  onReact(r);
                  onOpen(false);
                }}
              >
                {r}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** The Group's matchday room: chat bubbles for people (yours right/yellow, theirs left with
 * avatars), reactions clamped onto each message as sticker pills, money events as ticket stubs. */
export function Feed({ feed, me }: { feed: FeedApi; me: string }) {
  const [draft, setDraft] = useState("");
  const [picker, setPicker] = useState<string | null>(null); // message id with its picker open
  const endRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const reactions = useMemo(() => tallyReactions(feed.events, me), [feed.events, me]);
  // Only messages carry reactions in the scroll below; recompute count so new pills don't scroll.
  const msgCount = feed.events.filter((e) => e.kind === "message").length;

  // Stick to the bottom on new messages, but not when the user has scrolled up to read history.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottom) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgCount]);

  // Close an open picker on outside click.
  useEffect(() => {
    if (!picker) return;
    const onDown = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest(".react-add-wrap")) setPicker(null);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [picker]);

  if (!feed.enabled) {
    return (
      <div className="panel muted">
        Set <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to
        turn on the live Feed (see <code>.env.example</code>).
      </div>
    );
  }

  const events = feed.events;

  return (
    <div className="room">
      <div className="chat-header">
        <div className="chat-title">
          <span className="chat-live" data-on={feed.ready} aria-hidden="true" />
          <h2>The Room</h2>
        </div>
        <span className="chat-presence">
          {feed.present.length > 0 && (
            <span className="room-presence-avatars" aria-hidden="true">
              {feed.present.slice(0, 4).map((n) => (
                <span key={n} className="room-presence-dot">{n.slice(0, 1).toUpperCase()}</span>
              ))}
            </span>
          )}
          {feed.present.length} in the room{feed.ready ? "" : " · connecting…"}
        </span>
      </div>

      <div className="room-scroll" ref={scrollRef} aria-live="polite">
        {events.length === 0 && (
          <div className="room-empty">
            <span className="sticker" aria-hidden="true">📣</span>
            <p>Quiet in here. Talk trash, back a call — every stake shows up in the room.</p>
          </div>
        )}
        {events.map((e, i) => {
          const prev: FeedEvent | undefined = events[i - 1];
          if (e.kind === "system") {
            return (
              <div key={e.id} className={`stub stub-${stubKind(e.text)}`}>
                <span className="stub-text">{e.text}</span>
                <span className="stub-time">{timeOf(e.ts)}</span>
              </div>
            );
          }
          if (e.kind === "reaction") return null; // rendered inline under its target message
          const mine = e.author === me;
          // Show the author header only when the speaker changes (message runs read as one turn).
          const newSpeaker = !(prev && prev.kind === "message" && prev.author === e.author);
          const tallies = reactions.get(e.id) ?? [];
          return (
            <div key={e.id} className={`turn${mine ? " mine" : ""}`}>
              {!mine && (
                <span
                  className={`friend-avatar turn-avatar${newSpeaker ? "" : " hidden"}`}
                  aria-hidden="true"
                >
                  {e.author.slice(0, 1).toUpperCase()}
                </span>
              )}
              <div className="bubble-col">
                {newSpeaker && (
                  <span className="bubble-meta">
                    {mine ? "you" : e.author} <span className="bubble-time">{timeOf(e.ts)}</span>
                  </span>
                )}
                <div className="bubble">{e.text}</div>
                <Reactions
                  tallies={tallies}
                  open={picker === e.id}
                  onOpen={(v) => setPicker(v ? e.id : null)}
                  onReact={(emoji) => feed.sendReaction(emoji, e.id)}
                  side={mine ? "mine" : "theirs"}
                />
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <form
        className="room-composer"
        onSubmit={(ev) => {
          ev.preventDefault();
          feed.sendMessage(draft);
          setDraft("");
        }}
      >
        <input
          className="composer-input"
          value={draft}
          placeholder="Message the room…"
          onChange={(e) => setDraft(e.target.value)}
        />
        <button className="composer-send" type="submit" disabled={!feed.ready || !draft.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
