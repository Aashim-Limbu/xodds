"use client";

import { useEffect, useRef, useState } from "react";
import { GLOBAL_GROUP, type Group, type GroupInvite } from "@/lib/groups";

/** The Group Rail: first-class switching between your Groups as a row of sticker chips.
 * Active chip = pressed yellow sticker; unread activity = ink dot; pending invites are
 * dashed ghost chips with an inline Accept/Decline popover; [+] creates a Group. */
export function GroupRail({
  groups,
  activeId,
  invites,
  unread,
  onSwitch,
  onNew,
  onRespond,
}: {
  groups: Group[];
  activeId: string;
  invites: GroupInvite[];
  /** Group ids with feed events newer than the last time you had them active. */
  unread: Set<string>;
  onSwitch: (id: string) => void;
  onNew: () => void;
  onRespond: (invite: GroupInvite, accept: boolean) => void;
}) {
  const [openInvite, setOpenInvite] = useState<string | null>(null);
  const railRef = useRef<HTMLDivElement | null>(null);

  // Close the invite popover on outside click.
  useEffect(() => {
    if (!openInvite) return;
    const onDown = (e: PointerEvent) => {
      if (!railRef.current?.contains(e.target as Node)) setOpenInvite(null);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [openInvite]);

  return (
    <div className="group-rail-wrap" ref={railRef}>
      <span className="label muted">Your Groups</span>
      <div className="group-rail" role="tablist" aria-label="Your groups">
        {groups.map((g) => {
          const active = g.id === activeId;
          return (
            <button
              key={g.id}
              role="tab"
              aria-selected={active}
              className={`gchip${active ? " active" : ""}`}
              onClick={() => onSwitch(g.id)}
            >
              {g.id === GLOBAL_GROUP.id && <span className="msym" style={{ fontSize: 15 }}>public</span>}
              {g.name}
              {unread.has(g.id) && !active && (
                <span className="gchip-dot" title="New activity" aria-label="new activity" />
              )}
            </button>
          );
        })}
        {invites.map((inv) => (
          <button
            key={inv.group.id}
            className="gchip ghost"
            aria-expanded={openInvite === inv.group.id}
            onClick={() => setOpenInvite(openInvite === inv.group.id ? null : inv.group.id)}
          >
            {inv.group.name}
            <span className="gchip-tag">INVITE</span>
          </button>
        ))}
        <button className="gchip add" aria-label="New group" title="New group" onClick={onNew}>
          <span className="msym">add</span>
        </button>
      </div>
      {/* Invite prompt lives BELOW the rail in normal flow — the rail is an overflow
          container, so anything floated inside it gets clipped. */}
      {invites.filter((inv) => inv.group.id === openInvite).map((inv) => (
        <div key={inv.group.id} className="gchip-pop" role="region" aria-label={`Invite to ${inv.group.name}`}>
          <span>
            Join <strong>{inv.group.name}</strong>?{" "}
            <span className="muted" style={{ fontSize: 12 }}>invited by {inv.invitedBy}</span>
          </span>
          <div className="row" style={{ gap: 6 }}>
            <button onClick={() => { setOpenInvite(null); onRespond(inv, true); }}>Accept</button>
            <button className="secondary" onClick={() => { setOpenInvite(null); onRespond(inv, false); }}>
              Decline
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
