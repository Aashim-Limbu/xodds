"use client";

import { GLOBAL_GROUP, type Group } from "@/lib/groups";
import { Avatars } from "./Avatars";

/** The Group hero banner: identity (ID chip, name, blurb, presence), the live cash pot,
 * and ONE action — Add a Friend. Switching and creation live in the GroupRail above. */
export function GroupBar({
  groups,
  activeId,
  onAddFriend,
  potTotal,
  online = [],
}: {
  groups: Group[];
  activeId: string;
  onAddFriend: () => void;
  /** Formatted USD sum of the Group's open+locked Pool pots (null while loading). */
  potTotal: string | null;
  /** Display names currently on the Group's Feed channel (live presence). */
  online?: string[];
}) {
  const active = groups.find((g) => g.id === activeId) ?? GLOBAL_GROUP;
  const isGlobal = active.id === GLOBAL_GROUP.id;

  const blurb = isGlobal
    ? "The open market — anyone can spin up a Pool on any Fixture, and anyone can join. Settled by proof, never by a house."
    : "Your private syndicate. Create Pools, invite your mates, and settle every call on-chain.";

  return (
    <div className="hero">
      <div className="hero-content">
        <div className="hero-main">
          <span className="chip-id">ID: {active.id.slice(0, 8).toUpperCase()}</span>
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
          {!isGlobal && (
            <button className="hero-btn invite" onClick={onAddFriend}>
              <span className="msym">person_add</span>
              Add a Friend
            </button>
          )}
          {potTotal && (
            <div className="pot-chip">
              <span className="label">Cash pot</span>
              <strong>{potTotal}</strong>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
