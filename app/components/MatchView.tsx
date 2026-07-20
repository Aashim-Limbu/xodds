"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import type { PoolAccount } from "@/lib/anchorClient";
import { poolKickoffTs } from "@/lib/config";
import { friendlyError } from "@/lib/errors";
import { useFeed } from "@/lib/feed";
import { fixtureById, poolOutcomeLabels } from "@/lib/fixtures";
import { formatUsdc, parseUsdc, timeUntil } from "@/lib/format";
import { MARKETS, groupByFixture, lineMenu, marketLines } from "@/lib/markets";
import { findOrOpenPool } from "@/lib/openMarket";
import { useFinalWhistle } from "@/lib/useFinalWhistle";
import { marketState } from "@/lib/txline";
import { useFixtures, useTxlineLive } from "@/lib/useTxlineLive";
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
  // Real TxLINE scores — the same source PoolView's live strip uses.
  const live = useTxlineLive(fixtureId);
  const [pools, setPools] = useState<PoolAccount[]>([]);
  // Which Line each market's slider is on. Empty = use the menu's midpoint.
  const [selectedLine, setSelectedLine] = useState<Partial<Record<string, number>>>({});
  // Kept as a STRING like PoolView's picker: a bigint can't hold "2." mid-typing.
  const [amount, setAmount] = useState("5");
  const stake = (() => {
    try {
      return parseUsdc(amount);
    } catch {
      return 0n; // mid-edit / junk — Back is disabled below rather than sending 0
    }
  })();
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

  // One header slot, three states, so it is never an empty strip: a countdown before kickoff,
  // the real scoreline while the match runs, and the competition alone once it is done.
  const countdown = timeUntil(fixture.kickoff);
  const competition = fixture.competition ?? "Match";
  // Chain state outranks the feed. `live.score` keeps returning a record after full time and
  // its phase string can still read "In play", so gating on the feed alone left a SETTLED
  // Match claiming to be live — next to its own Proof Receipt.
  const done = match?.state === "settled" || match?.state === "void";
  const status = done ? (
    <span className="kickoff-line">
      <strong>{match?.state === "void" ? "Void" : "Full time"}</strong>
      {live.score ? ` · ${fixture.home} ${live.score.home}–${live.score.away} ${fixture.away}` : ""}
    </span>
  ) : live.score ? (
    <span className="live-strip" role="status">
      <span className="live-dot" aria-hidden="true" />
      <span className="live-phase">{live.score.phase}</span>
      <span className="live-score">
        {fixture.home} {live.score.home}–{live.score.away} {fixture.away}
      </span>
    </span>
  ) : countdown ? (
    <span className="kickoff-line">
      <strong>{competition}</strong> · kicks off in {countdown}
    </span>
  ) : (
    <span className="kickoff-line"><strong>{competition}</strong> · under way</span>
  );

  return (
    // The banner describes the whole Match, so it spans the full width ABOVE the two columns.
    // Nested inside the left one, it pushed the markets panel down while the Room started at
    // the banner's top — so the two columns visibly began at different heights.
    <>
      <MatchBanner
        fixture={fixture}
        fixtureId={fixtureId}
        state={match?.state ?? "open"}
        pot={match?.pot ?? 0n}
        markets={pools.length}
        status={status}
      />

      <div className="pool-layout match-layout">
        <div className="stack" style={{ gap: 18 }}>
          {error && <p className="error" role="alert">{error}</p>}

          {match && <MatchReceipt match={match} />}

          <div className="panel stack">
          {MARKETS.map((spec) => {
            const existing = pools.filter((p) => p.poolType === spec.poolType);
            // The slider's menu: what the feed quotes, plus every Line that already holds
            // money, plus a standard spread. The feed is not the limit — it quoted zero
            // usable full-match goal Lines on this slate (lib/markets.ts).
            const menu = lineMenu(spec, marketLines(spec, live), existing.map((p) => p.lineX2));
            const selected = selectedLine[spec.poolType] ?? menu[Math.floor(menu.length / 2)] ?? 0;
            // A Pool at the selected Line, if one exists. Several Pools CAN share a Line —
            // line_x2 isn't in the PDA seeds — so the rest stay reachable via the chips below.
            const atLine = existing.filter((p) => p.lineX2 === selected);
            const pool = atLine[0] ?? null;
            // Every Line with money, so a Pool can never hide behind an unturned slider.
            const openLines = [...existing]
              .sort((a, b) => a.lineX2 - b.lineX2)
              .map((p) => ({ lineX2: p.lineX2, pot: p.pot }));

            return (
              <MarketSection
                key={spec.poolType}
                spec={spec}
                lineX2={selected}
                lines={menu}
                onLineChange={(lineX2) =>
                  setSelectedLine((prev) => ({ ...prev, [spec.poolType]: lineX2 }))
                }
                openLines={openLines}
                pool={pool}
                labels={poolOutcomeLabels(spec.poolType, selected, fixture)}
                myEntries={pool ? myEntries[pool.address.toBase58()] ?? {} : {}}
                stake={stake}
                busy={busy}
                canOpen={canOpen}
                onBack={back}
              />
            );
          })}
          </div>
        </div>

        {/* Right column, two sections: the stake control that every BACK button reads, then
            the Room. The markets run down the whole left column, so the stake belongs beside
            them rather than pushing them down. */}
        <div className="match-rail">
          {/* One stake for every market on the Match — the same control PoolView puts in its
              rail, moved to the top here because the markets run down the whole column. */}
          <div className="panel stake-card match-stake rail-card">
            <h3 className="stake-title">Your stake</h3>
            <p className="stake-hint">Every BACK button uses this.</p>
            <div className="stake-chips" role="group" aria-label="Stake amount">
              {["1", "5", "10", "25"].map((v) => (
                <button
                  key={v}
                  className={`stake-chip${amount === v ? " active" : ""}`}
                  aria-pressed={amount === v}
                  onClick={() => setAmount(v)}
                >
                  ${v}
                </button>
              ))}
              <label className="stake-custom">
                <span className="label">Custom</span>
                <span className="stake-field">
                  <span aria-hidden="true">$</span>
                  <input
                    value={amount}
                    inputMode="decimal"
                    aria-label="Custom stake amount in dollars"
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </span>
              </label>
            </div>
          </div>


        {/* The Room is the second grid column, not a slab under a long market list — on a Match
            page the markets scroll for screens and the chat has to stay reachable beside them. */}
        {/* A settled or void Match has no money left to move, so the Room goes read-only:
            history stays (the receipt is the point), the composer goes. */}
        <Feed
          feed={feed}
          me={displayName}
          myId={wallet ?? displayName}
          locked={
            match && (match.state === "settled" || match.state === "void")
              ? { reason: `This Match is ${match.state === "void" ? "void" : "settled"} — the room is closed.` }
              : undefined
          }
        />
        </div>
      </div>
    </>
  );
}
