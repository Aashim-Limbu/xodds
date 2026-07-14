"use client";

import { useEffect, useState } from "react";
import { pick1x2Probabilities, type OddsPayload, type TxlineLive } from "./txline";

// Fetch real TxLINE Reference Odds + Feed lines for a Fixture via the server route, then keep
// the odds live off the SSE relay. Returns {} until loaded and whenever no token is configured,
// so callers fall back to static fixtures. PoolView reads `referenceProbabilities` unchanged;
// the snapshot seeds it and stream events update it in place.
export function useTxlineLive(fixtureId: bigint): TxlineLive {
  const [live, setLive] = useState<TxlineLive>({});

  // Snapshot: seeds Reference Odds + Feed lines.
  useEffect(() => {
    if (!fixtureId) return; // 0n is falsy — skip until the Pool's real fixtureId loads
    let alive = true;
    fetch(`/api/txline?fixtureId=${fixtureId}`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((d) => alive && setLive((prev) => ({ ...d, ...prev }))) // keep any live-streamed odds
      .catch(() => {});
    return () => {
      alive = false;
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
