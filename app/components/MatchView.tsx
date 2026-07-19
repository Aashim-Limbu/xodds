"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import type { PoolAccount } from "@/lib/anchorClient";
import { poolKickoffTs } from "@/lib/config";
import { friendlyError } from "@/lib/errors";
import { useFeed } from "@/lib/feed";
import { fixtureById, poolOutcomeLabels } from "@/lib/fixtures";
import { formatUsdc } from "@/lib/format";
import { MARKETS, groupByFixture } from "@/lib/markets";
import { findOrOpenPool } from "@/lib/openMarket";
import { useFinalWhistle } from "@/lib/useFinalWhistle";
import { marketState } from "@/lib/txline";
import { useFixtures } from "@/lib/useTxlineLive";
import { useMyName } from "@/lib/useMyName";
import { MatchBanner } from "./MatchBanner";
import { MarketSection, type BackTarget } from "./MarketSection";
import { MatchReceipt } from "./MatchReceipt";
import { Feed } from "./Feed";

export function MatchView({ group, fixtureId }: { group: PublicKey; fixtureId: bigint }) {
  const { client, address: wallet, getAccessToken } = useFinalWhistle();
  // Hydrate real TxLINE fixtures on direct /match/<...> loads — same reasoning as PoolView.
  useFixtures();
  const { name: displayName } = useMyName();
  // One Room for the whole Match — not one per market.
  const feed = useFeed(`fixture:${group.toBase58()}:${fixtureId.toString()}`, displayName, wallet);
  const [pools, setPools] = useState<PoolAccount[]>([]);
  const stake = 5_000_000n; // ponytail: fixed stake until a stake picker exists
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const backInFlight = useRef(false);

  // My stake per (pool address -> outcome -> amount), so "You're in $X" survives across markets.
  // Failures resolve to empty rather than breaking the page.
  const [myEntries, setMyEntries] = useState<Record<string, Record<number, bigint | undefined>>>({});

  const load = useCallback(
    async (ignore?: { current: boolean }) => {
      if (!client) return;
      const all = await client.listPools(group);
      if (ignore?.current) return;
      const mine = all.filter((p) => p.fixtureId === fixtureId);
      setPools(mine);
      const entries: Record<string, Record<number, bigint | undefined>> = {};
      await Promise.all(
        mine.map(async (p) => {
          const outcomes = p.poolType === "matchWinner" ? [0, 1, 2] : [0, 1];
          const found: Record<number, bigint | undefined> = {};
          await Promise.all(
            outcomes.map(async (o) => {
              found[o] = (await client.fetchEntryAmount(p.address, o).catch(() => null)) ?? undefined;
            }),
          );
          entries[p.address.toBase58()] = found;
        }),
      );
      if (ignore?.current) return;
      setMyEntries(entries);
    },
    [client, group, fixtureId],
  );

  useEffect(() => {
    const ignore = { current: false };
    void load(ignore);
    return () => {
      ignore.current = true;
    };
  }, [load]);

  const fixture = fixtureById(fixtureId);
  // A market with no Pool yet may only be opened before kickoff — otherwise a new Pool would be
  // stamped with a kickoff seconds from now on a match whose result is already known.
  // `ended` is subsumed: an ended fixture has necessarily kicked off.
  const canOpen = fixture ? marketState(fixture.kickoff, Date.now(), false) === "open" : false;
  const match = groupByFixture(pools)[0];

  async function back(target: BackTarget, outcome: number) {
    if (!client || !fixture) return;
    if (backInFlight.current) return;
    backInFlight.current = true;
    setBusy(true);
    setError(null);
    let opened = false;
    try {
      if (target.pool) {
        // This section already has a Pool — stake straight into it. Re-deriving via
        // findOrOpenPool's (poolType, lineX2) match would risk picking a DIFFERENT Pool
        // that happens to share that shape (line isn't part of the PDA seeds).
        await client.placeEntry(target.pool, outcome, stake);
      } else {
        // Re-check at action time, not just render time: `canOpen` above can go stale if the
        // page sits open across kickoff. The chain won't reject this — poolKickoffTs fabricates
        // a future kickoff for a past-kickoff fixture — so this is the only gate.
        if (marketState(fixture.kickoff, Date.now(), false) !== "open") {
          setError("This match has kicked off — you can't open a new market on it now.");
          return;
        }
        const { pool, created } = await findOrOpenPool({
          client, group, fixture, poolType: target.poolType, lineX2: target.lineX2,
          kickoffTs: poolKickoffTs(fixture.kickoff), getAccessToken,
        });
        opened = created;
        await client.placeEntry(pool, outcome, stake);
      }
      await load();
    } catch (e) {
      // `placeEntry` can throw on a confirmation timeout for a transaction that DID land, so we
      // must not promise the money wasn't taken. Point at the pot, which is the actual evidence.
      setError(
        opened
          ? `Market opened. Your $${formatUsdc(stake)} may not have gone through — check the pot below before backing again.`
          : friendlyError(e),
      );
      if (opened) await load();
    } finally {
      setBusy(false);
      backInFlight.current = false;
    }
  }

  if (!fixture) return <div className="panel muted">Loading Match…</div>;

  return (
    <div className="pool-layout">
      <div className="stack" style={{ gap: 0 }}>
        <MatchBanner
          fixture={fixture}
          fixtureId={fixtureId}
          state={match?.state ?? "open"}
          pot={match?.pot ?? 0n}
          markets={pools.length}
        />

        {error && <p className="error" role="alert">{error}</p>}

        {match && <MatchReceipt match={match} />}

        <div className="panel stack">
          {MARKETS.flatMap((spec) => {
            const existing = pools.filter((p) => p.poolType === spec.poolType);
            // One section PER EXISTING POOL, not per distinct line. Two Pools can share a
            // (type, line) — `line_x2` isn't in the PDA seeds — and collapsing them by line
            // would hide the second one's money entirely. Money must never be invisible.
            if (existing.length === 0) {
              return [
                <MarketSection
                  key={`${spec.poolType}:new`}
                  spec={spec}
                  lineX2={spec.defaultLineX2}
                  pool={null}
                  labels={poolOutcomeLabels(spec.poolType, spec.defaultLineX2, fixture)}
                  myEntries={{}}
                  stake={stake}
                  busy={busy}
                  canOpen={canOpen}
                  onBack={back}
                />,
              ];
            }
            return existing.map((pool) => (
              <MarketSection
                key={pool.address.toBase58()}
                spec={spec}
                lineX2={pool.lineX2}
                pool={pool}
                labels={poolOutcomeLabels(spec.poolType, pool.lineX2, fixture)}
                myEntries={myEntries[pool.address.toBase58()] ?? {}}
                stake={stake}
                busy={busy}
                canOpen={canOpen}
                onBack={back}
              />
            ));
          })}
        </div>

        <Feed feed={feed} me={displayName} myId={wallet ?? displayName} />
      </div>
    </div>
  );
}
