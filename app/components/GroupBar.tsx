"use client";

import { useState } from "react";
import { GLOBAL_GROUP, type Group, inviteUrl } from "@/lib/groups";
import { Avatars } from "./Avatars";

/** The Group hero banner: name, blurb, members, and the group-scoped actions
 * (switch Group, invite a link, create a new Group). Stadium + stickers are decorative. */
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
  const isGlobal = active.id === GLOBAL_GROUP.id;

  // Fabricated member count — the app tracks no Group membership. Big for the open market,
  // small for a private syndicate. Deterministic so it doesn't jump around.
  const members = isGlobal ? 1204 : 4 + (active.id.charCodeAt(0) % 20);
  const blurb = isGlobal
    ? "The open market — anyone can spin up a Pool on any Fixture, and anyone can join. Settled by proof, never by a house."
    : "Your private syndicate. Create Pools, invite your mates, and settle every call on-chain.";

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
    <div className="hero">
      {/* Right-side collage — one seamless crop from the Stitch reference (stadium, flags,
          trophy, crowd), on a hero bg matched to its yellow so there is no visible seam. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="hero-collage" src="/stickers/hero-right.png" alt="" aria-hidden="true" />

      <div className="hero-content">
        <span className="chip-id">ID: {active.id.slice(0, 8).toUpperCase()}</span>
        <h1 className="hero-title" style={{ marginTop: 8 }}>{active.name}</h1>
        <p className="hero-sub" style={{ maxWidth: 380 }}>{blurb}</p>

        <div className="hero-members">
          <Avatars seed={active.id} count={members} shown={4} showMore={false} />
          <span className="label">{members.toLocaleString()} MEMBERS</span>
        </div>

        <div className="row" style={{ marginTop: 18, flexWrap: "wrap", gap: 10 }}>
          <label className="row" style={{ gap: 8 }}>
            <span className="chip-id">Group</span>
            <select value={activeId} onChange={(e) => onSwitch(e.target.value)}>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
          {!isGlobal && (
            <button className="secondary" onClick={invite}>
              {copied ? "Link copied ✓" : "🔗 Invite"}
            </button>
          )}
          <button onClick={create}>+ New group</button>
        </div>
      </div>
    </div>
  );
}
