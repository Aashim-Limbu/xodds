"use client";

import { useState } from "react";
import { GLOBAL_GROUP, type Group, inviteUrl } from "@/lib/groups";

/** Pick the active Group, create a new friend Group, or copy an invite link to share. */
export function GroupBar({
  groups,
  activeId,
  onSwitch,
  onCreate,
}: {
  groups: Group[];
  activeId: string;
  onSwitch: (id: string) => void;
  onCreate: (name: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const active = groups.find((g) => g.id === activeId) ?? GLOBAL_GROUP;

  async function invite() {
    await navigator.clipboard.writeText(inviteUrl(active));
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  function create() {
    const name = window.prompt("Name your friend Group");
    if (name?.trim()) onCreate(name.trim());
  }

  return (
    <div className="panel row between">
      <div className="row" style={{ gap: 10 }}>
        <span className="muted" style={{ fontSize: 13 }}>Group</span>
        <select value={activeId} onChange={(e) => onSwitch(e.target.value)}>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </div>
      <div className="row" style={{ gap: 8 }}>
        {active.id !== GLOBAL_GROUP.id && (
          <button className="secondary" onClick={invite}>
            {copied ? "Link copied ✓" : "Invite friends"}
          </button>
        )}
        <button className="secondary" onClick={create}>
          New group
        </button>
      </div>
    </div>
  );
}
