"use client";

import { Face } from "@/components/Avatars";
import { formatUsdc, shortAddress } from "@/lib/format";
import { useLeaderboard } from "@/lib/useLeaderboard";
import type { Standing } from "@/lib/leaderboard";

const RANK_STICKER = ["🥇", "🥈", "🥉"];

/** Season standings for a Group, aggregated from settled Pools. Fed by useLeaderboard, which
 * reads the durable `pool_results` rows each Pool records at settlement. */
export function Leaderboard({ groupChannel }: { groupChannel: string }) {
  const { standings } = useLeaderboard(groupChannel);
  if (standings.length === 0) return null; // nothing settled yet — stay quiet, don't fake it

  return (
    <div className="panel stack" style={{ gap: 12 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <h2 style={{ margin: 0 }}>Leaderboard</h2>
        <span className="muted" style={{ fontSize: 12, fontWeight: 700 }}>NET USDC · THIS GROUP</span>
      </div>
      <div className="lb-table">
        {standings.map((s, i) => (
          <Row key={s.wallet} rank={i} s={s} />
        ))}
      </div>
    </div>
  );
}

function Row({ rank, s }: { rank: number; s: Standing }) {
  const positive = s.net > 0n;
  const flat = s.net === 0n;
  return (
    <div className="lb-row">
      <span className="lb-rank">{RANK_STICKER[rank] ?? rank + 1}</span>
      <Face id={s.wallet} size={24} />
      <span className="lb-name" title={s.wallet}>
        {s.name.includes("@") || s.name.length < 12 ? s.name : shortAddress(s.name)}
        {s.streak >= 3 && <span className="lb-streak" title={`${s.streak}-win streak`}>🔥{s.streak}</span>}
      </span>
      <span className="lb-record">
        {s.wins}/{s.plays} won
      </span>
      {/* Net is text-signed (+/−), not color-alone (CLAUDE.md: state never color-only). */}
      <span className={`lb-net ${positive ? "up" : flat ? "" : "down"}`}>
        {positive ? "+" : flat ? "" : "−"}${formatUsdc(s.net < 0n ? -s.net : s.net)}
      </span>
    </div>
  );
}
