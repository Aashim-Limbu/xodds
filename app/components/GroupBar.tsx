"use client";

import { GLOBAL_GROUP, type Group, inviteUrl } from "@/lib/groups";
import { Avatars } from "./Avatars";
import { InviteModal } from "./InviteModal";

/** The Group hero banner: name, blurb, members, and the group-scoped actions
 * (switch Group, invite a link, create a new Group). Stadium + stickers are decorative. */
export function GroupBar({
  groups,
  activeId,
  onSwitch,
  onCreate,
  online = [],
}: {
  groups: Group[];
  activeId: string;
  onSwitch: (id: string) => void;
  onCreate: (name: string) => void;
  /** Display names currently on the Group's Feed channel (live presence). */
  online?: string[];
}) {
  const active = groups.find((g) => g.id === activeId) ?? GLOBAL_GROUP;
  const isGlobal = active.id === GLOBAL_GROUP.id;

  const blurb = isGlobal
    ? "The open market — anyone can spin up a Pool on any Fixture, and anyone can join. Settled by proof, never by a house."
    : "Your private syndicate. Create Pools, invite your mates, and settle every call on-chain.";

  function create() {
    const name = window.prompt("Name your friend Group");
    if (name?.trim()) onCreate(name.trim());
  }

  return (
    <div className="hero">
      <div className="hero-content">
        <div className="hero-main">
          <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
            <span className="chip-id">ID: {active.id.slice(0, 8).toUpperCase()}</span>
            {/* group switcher kept compact next to the ID (Stitch shows just the chip) */}
            <select
              value={activeId}
              onChange={(e) => onSwitch(e.target.value)}
              aria-label="Switch group"
              style={{ padding: "3px 8px", fontSize: 12 }}
            >
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
          <h1 className="hero-title" style={{ marginTop: 12 }}>{active.name}</h1>
          <p className="hero-sub">{blurb}</p>
          {/* Honest presence: who is on the Group Feed right now — no fabricated membership. */}
          {online.length > 0 && (
            <div className="hero-members">
              <Avatars seed={active.id} count={online.length} shown={3} showMore />
              <span className="label">{online.length} ONLINE NOW</span>
            </div>
          )}
        </div>

        <div className="hero-actions">
          <InviteModal url={inviteUrl(active)} />
          <button className="hero-btn newpool" onClick={create}>
            <span className="msym">add_circle</span>
            New Group
          </button>
        </div>
      </div>
    </div>
  );
}
