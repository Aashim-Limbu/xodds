// Feed event shape + the history/broadcast merge seam, extracted pure so it's unit-testable
// (tests/feed-merge.test.ts) and browser/server agnostic.

export type FeedEventKind = "message" | "reaction" | "system";

export interface FeedEvent {
  id: string;
  kind: FeedEventKind;
  author: string; // display name; "" for system posts
  text: string; // message text, reaction emoji, or system line
  ts: number;
  target?: string; // reaction only: id of the message it's clamped onto (undefined = legacy free-floating)
}

export const FEED_CAP = 200;

/** Merge already-shown events with newly arrived ones (persisted history or live broadcasts,
 * any order): dedupe by id (first seen wins), chronological, capped to the newest FEED_CAP. */
export function mergeEvents(existing: FeedEvent[], incoming: FeedEvent[]): FeedEvent[] {
  const byId = new Map<string, FeedEvent>();
  for (const e of [...existing, ...incoming]) if (!byId.has(e.id)) byId.set(e.id, e);
  return [...byId.values()].sort((a, b) => a.ts - b.ts).slice(-FEED_CAP);
}
