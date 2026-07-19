"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PublicKey } from "@solana/web3.js";
import { type Fixture } from "@/lib/fixtures";
import { marketState } from "@/lib/txline";
import { useEndedFixtures, useFixtures } from "@/lib/useTxlineLive";

const DEMO = "Demo";

function kickoffLabel(kickoff: number): string {
  const ms = kickoff * 1000 - Date.now();
  if (ms <= 0) return "Kicked off";
  const hours = ms / 3_600_000;
  if (hours > 72) return new Date(kickoff * 1000).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  if (hours >= 1) return `in ${Math.round(hours)}h`;
  return `in ${Math.max(1, Math.round(ms / 60_000))}m`;
}

/** OPEN -> the kickoff countdown; LIVE -> "Live"; ENDED -> "Full time". ENDED is feed-truth
 * (marketState gates it on the finalised set), so a finished match no longer lies "Kicked off". */
function gameLabel(f: Fixture, ended: Set<string>): string {
  const state = marketState(f.kickoff, Date.now(), ended.has(f.fixtureId.toString()));
  return state === "ended" ? "Full time" : state === "live" ? "Live" : kickoffLabel(f.kickoff);
}

/** The available-games browser: real TxLINE Fixtures as tappable cards, grouped by
 * competition. Tap a card -> the Match page for that (group, fixture). */
export function GameBrowser({ group }: { group: PublicKey }) {
  const router = useRouter();
  const fixtures = useFixtures();
  const ended = useEndedFixtures(fixtures);
  const [tab, setTab] = useState<string>("All");

  const competitions = useMemo(() => {
    const names = new Set(fixtures.map((f) => f.competition ?? DEMO));
    // World Cup front and centre, demo slate last.
    return ["All", ...[...names].sort((a, b) =>
      (a === "World Cup" ? -1 : b === "World Cup" ? 1 : a === DEMO ? 1 : b === DEMO ? -1 : a.localeCompare(b)))];
  }, [fixtures]);

  const shown = fixtures
    .filter((f) => tab === "All" || (f.competition ?? DEMO) === tab)
    .sort((a, b) => a.kickoff - b.kickoff);

  return (
    <div className="panel stack" style={{ gap: 14 }}>
      <div className="row between" style={{ flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ margin: 0 }}>Available Games</h2>
        {competitions.length > 2 && (
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            {competitions.map((c) => (
              <button
                key={c}
                className={`gchip${tab === c ? " active" : ""}`}
                aria-pressed={tab === c}
                onClick={() => setTab(c)}
              >
                {c}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="fixture-grid">
        {shown.map((f) => (
          <button
            key={f.fixtureId.toString()}
            className="fixture-card"
            onClick={() => router.push(`/match/${group.toBase58()}/${f.fixtureId.toString()}`)}
          >
            <span className={`badge${(f.competition ?? DEMO) === "World Cup" ? " badge-wc" : ""}`}>
              {(f.competition ?? DEMO).toUpperCase()}
            </span>
            <strong className="fixture-teams">{f.home} vs {f.away}</strong>
            <span className="row between" style={{ width: "100%" }}>
              <span className="label muted">{gameLabel(f, ended)}</span>
              <span className="label" style={{ color: "var(--green)" }}>+ POOL</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
