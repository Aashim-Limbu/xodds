"use client";

import { useEffect, useState } from "react";
import { FIXTURES, hydrateFixtures, restoreSeenFixtures, type Fixture } from "./fixtures";
import { pick1x2Probabilities, type OddsPayload, type TxlineLive } from "./txline";

// Fetch real TxLINE Reference Odds + Feed lines for a Fixture via the server route, then keep
// the odds live off the SSE relay. Returns {} until loaded and whenever no token is configured,
// so callers fall back to static fixtures. PoolView reads `referenceProbabilities` unchanged;
// the snapshot seeds it and stream events update it in place.
export function useTxlineLive(fixtureId: bigint): TxlineLive {
  const [live, setLive] = useState<TxlineLive>({});

  // Snapshot: seeds Reference Odds + Feed lines, and re-polls so the live scoreline moves.
  useEffect(() => {
    setLive({}); // switching fixtures must not keep the previous fixture's odds/score/lines
    if (!fixtureId) return; // 0n is falsy — skip until the Pool's real fixtureId loads
    let alive = true;
    const load = () =>
      fetch(`/api/txline?fixtureId=${fixtureId}`)
        .then((r) => (r.ok ? r.json() : {}))
        // Snapshot overwrites; an active stream re-overwrites the odds within seconds anyway,
        // and if the stream dropped this keeps them fresh.
        .then((d: TxlineLive) => alive && setLive((prev) => ({ ...prev, ...d })))
        .catch(() => {});
    load();
    const id = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [fixtureId]);

  // Stream: live-moving 1X2 probabilities during Open. EventSource can't send headers, so this
  // hits our relay route; on no-token (204) it errors once and we close to avoid reconnect storms.
  useEffect(() => {
    if (!fixtureId || typeof window === "undefined") return;
    const es = new EventSource(`/api/txline/stream?fixtureId=${fixtureId}`);
    const recent: OddsPayload[] = []; // rolling window; pick1x2Probabilities takes the latest 1X2 line
    es.onmessage = (e) => {
      try {
        // ponytail: relay forwards TxLINE's OddsStreamEvent data field (one OddsPayload per event).
        const payload = JSON.parse(e.data) as OddsPayload;
        recent.push(payload);
        if (recent.length > 40) recent.shift();
        const probs = pick1x2Probabilities(recent);
        if (probs) setLive((prev) => ({ ...prev, referenceProbabilities: probs }));
      } catch {
        // ignore keep-alives / non-JSON frames
      }
    };
    es.onerror = () => es.close(); // 204 or drop — snapshot value stays
    return () => es.close();
  }, [fixtureId]);

  return live;
}

/** Which already-kicked-off Fixtures the scores feed reports finalised, for the games-list
 * ENDED badge. Feed-truth only: OPEN/LIVE the caller derives from the clock via marketState().
 * Polls every 60s (a browse list, not a live ticker); empty when the feed is dark. */
export function useEndedFixtures(fixtures: Fixture[]): Set<string> {
  const [ended, setEnded] = useState<Set<string>>(new Set());
  const startedIds = fixtures
    .filter((f) => f.kickoff * 1000 <= Date.now())
    .map((f) => f.fixtureId.toString())
    .join(",");
  useEffect(() => {
    if (!startedIds) {
      setEnded(new Set());
      return;
    }
    let alive = true;
    const load = () =>
      fetch(`/api/txline/states?ids=${startedIds}`)
        .then((r) => (r.ok ? r.json() : { ended: [] }))
        .then((d: { ended: string[] }) => alive && setEnded(new Set(d.ended)))
        .catch(() => {});
    load();
    const id = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [startedIds]);
  return ended;
}

/** The Fixture slate for pickers: static demo Fixtures plus any real TxLINE Fixtures
 * (hydrated once per page load; empty response = static only). */
export function useFixtures(): Fixture[] {
  const [fixtures, setFixtures] = useState<Fixture[]>([...FIXTURES]);
  useEffect(() => {
    let alive = true;
    // Fixtures seen on a previous visit resolve immediately — a settled Pool's match has
    // already dropped out of the upcoming snapshot below.
    restoreSeenFixtures();
    setFixtures([...FIXTURES]);
    // Two sources, both merged by fixtureId: TxLINE's upcoming snapshot (fresh, but drops a
    // match the moment it kicks off) and our own name book (durable, and the only thing that
    // can name a settled Pool's Fixture — including for a stranger on a share link).
    for (const url of ["/api/txline/fixtures", "/api/fixtures"]) {
      fetch(url)
        .then((r) => (r.ok ? r.json() : []))
        .then((real: Array<{ fixtureId: string; home: string; away: string; kickoff: number }>) => {
          if (!alive || !real.length) return;
          hydrateFixtures(real);
          setFixtures([...FIXTURES]);
        })
        .catch(() => {});
    }
    return () => {
      alive = false;
    };
  }, []);
  return fixtures;
}
