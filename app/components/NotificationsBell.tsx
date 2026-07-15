"use client";

import { useEffect, useRef, useState } from "react";
import { type FeedEvent } from "@/lib/feed";

/** The nav bell: unread count + dropdown of the Group's latest Feed events.
 * Seen-state is per-Group so reading one Group's events doesn't mark another's read. */
export function NotificationsBell({ events, groupId }: { events: FeedEvent[]; groupId: string }) {
  const SEEN_KEY = `xodds-notif-seen:${groupId}`;
  const [open, setOpen] = useState(false);
  const [seenTs, setSeenTs] = useState(0);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setSeenTs(Number(localStorage.getItem(SEEN_KEY)) || 0);
    setOpen(false);
  }, [SEEN_KEY]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [open]);

  const unread = events.filter((e) => e.ts > seenTs).length;
  const latest = events.slice(-8).reverse();

  function toggle() {
    if (!open) {
      const now = Date.now();
      localStorage.setItem(SEEN_KEY, String(now));
      setSeenTs(now);
    }
    setOpen((o) => !o);
  }

  return (
    <div className="notif" ref={ref}>
      <button
        className="nav-icon-btn"
        aria-label={unread > 0 ? `Notifications, ${unread} new` : "Notifications"}
        aria-expanded={open}
        onClick={toggle}
      >
        <span className="msym">notifications</span>
        {unread > 0 && <span className="notif-dot">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <div className="notif-panel" role="dialog" aria-label="Notifications">
          <h2>Latest</h2>
          {latest.length === 0 && <span className="muted">Nothing yet — activity in your Group shows up here.</span>}
          {latest.map((e) => (
            <div key={e.id} className="notif-item">
              {e.kind === "system" ? e.text : <><strong>{e.author}</strong> {e.text}</>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
