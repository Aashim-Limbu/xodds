"use client";

import { type RealtimeChannel } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";
import { FEED_ENABLED } from "./config";
import { mergeEvents, type FeedEvent } from "./feedEvents";
import { supabase } from "./supabase";

export type { FeedEvent, FeedEventKind } from "./feedEvents";

/** Latest event timestamp per channel — powers the Group Rail's unread dots. One query
 * over recent history, reduced client-side (PostgREST has no group-by). */
export async function fetchLatestActivity(channelKeys: string[]): Promise<Map<string, number>> {
  const latest = new Map<string, number>();
  if (!supabase || channelKeys.length === 0) return latest;
  const { data } = await supabase
    .from("feed_events")
    .select("channel, ts")
    .in("channel", channelKeys)
    .order("ts", { ascending: false })
    .limit(200);
  for (const row of data ?? []) {
    if (!latest.has(row.channel)) latest.set(row.channel, row.ts);
  }
  return latest;
}

// Realtime channels for the live layer, plus a public `feed_events` table for history (see
// DEMO.md for the one-time SQL). If the table doesn't exist, the Feed degrades to ephemeral
// broadcast-only — exactly the old behavior — rather than breaking.

export interface FeedApi {
  enabled: boolean;
  ready: boolean;
  events: FeedEvent[];
  present: string[]; // display names currently on this channel
  sendMessage: (text: string) => void;
  /** React to a specific message. Idempotent per (message, emoji, you) — re-tapping is a no-op. */
  sendReaction: (emoji: string, target: string) => void;
  /** Announce an action once — deduped by `id` so many observers don't repeat it. */
  postSystem: (id: string, text: string) => void;
}

/**
 * The Feed on a Supabase Realtime channel + persisted history. Keyed by an arbitrary
 * channel string — the app uses `group:<groupId>` so the stream is per-Group (CONTEXT.md):
 * one social surface spanning all the Group's Pools, mounted on both the Group home and
 * every Pool page. Pass "" to render a disabled placeholder until the key is known.
 */
/**
 * @param identity a stable per-user id (the wallet address) used to dedupe reactions — display
 * names aren't unique, so two "anon"s must still count as two reactors. Falls back to the
 * display name when absent.
 */
export function useFeed(channelKey: string, displayName: string, identity?: string): FeedApi {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [present, setPresent] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  // Local echo guard for postSystem: many observers derive the same system post; each client
  // suppresses its own resend, and the id-dedupe in mergeEvents drops cross-client repeats.
  const posted = useRef<Set<string>>(new Set());
  // System posts fired before the channel is SUBSCRIBED would be silently dropped by
  // send(); buffer them and flush once ready so the acting client sees its own post.
  const pending = useRef<FeedEvent[]>([]);
  const presenceKey = useRef(`c-${Math.random().toString(36).slice(2)}`);

  const add = useCallback((incoming: FeedEvent[]) => {
    setEvents((prev) => mergeEvents(prev, incoming));
  }, []);

  useEffect(() => {
    const sb = supabase;
    if (!sb || !channelKey) return;
    let cancelled = false; // guards the async history fetch against a Group switch mid-flight
    posted.current = new Set();
    setEvents([]);

    // History first — late joiners and reloads see the Group's record, not an empty room.
    sb
      .from("feed_events")
      .select("id, kind, author, text, ts, target")
      .eq("channel", channelKey)
      .order("ts", { ascending: false })
      .limit(200)
      .then(({ data, error }) => {
        if (!cancelled && !error && data) add(data as FeedEvent[]);
        // error (e.g. table missing) -> ephemeral mode, same as before persistence existed
      });

    const channel = sb.channel(channelKey, {
      // Presence keyed per-client (not per-name) so two "anon"s or two devices count as two;
      // the tracked payload still carries the display name.
      config: { broadcast: { self: true }, presence: { key: presenceKey.current } },
    });
    channel
      .on("broadcast", { event: "feed" }, ({ payload }) => add([payload as FeedEvent]))
      .on("presence", { event: "sync" }, () => {
        const names = Object.values(channel.presenceState()).flatMap((entries) =>
          (entries as Array<{ name?: string }>).map((e) => e.name ?? "anon"),
        );
        setPresent(Array.from(new Set(names)));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ name: displayName || "anon" });
          setReady(true);
          // Flush system posts that fired before the channel was up.
          for (const e of pending.current.splice(0)) {
            channel.send({ type: "broadcast", event: "feed", payload: e });
          }
        }
      });
    channelRef.current = channel;
    return () => {
      cancelled = true;
      sb.removeChannel(channel);
      channelRef.current = null;
      setReady(false);
      setPresent([]);
    };
  }, [channelKey, displayName, add]);

  const broadcast = useCallback(
    (event: FeedEvent) => {
      channelRef.current?.send({ type: "broadcast", event: "feed", payload: event });
      // Persist fire-and-forget. ignoreDuplicates -> ON CONFLICT DO NOTHING, so concurrent
      // observers posting the same system id neither error nor need UPDATE rights (the
      // demo RLS grants insert only). Failure (missing table) leaves the event ephemeral.
      void supabase
        ?.from("feed_events")
        .upsert({ channel: channelKey, ...event }, { onConflict: "id", ignoreDuplicates: true })
        .then(() => {});
    },
    [channelKey],
  );

  const randomId = () => `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;

  const sendMessage = useCallback(
    (text: string) => {
      if (!text.trim()) return;
      broadcast({ id: randomId(), kind: "message", author: displayName || "anon", text: text.trim(), ts: Date.now() });
    },
    [broadcast, displayName],
  );

  const sendReaction = useCallback(
    (emoji: string, target: string) => {
      // Reactions render as anonymous count pills, so `author` carries the stable identity (the
      // wallet), not a display name — that's what makes the dedupe exact when two users share a
      // name. Deterministic id → ON CONFLICT DO NOTHING dedupes one reaction per (message, emoji,
      // you) across reloads and clients. ponytail: no toggle-off — un-reacting needs a DELETE path
      // + RLS delete policy; add that if users ask to remove reactions.
      const who = identity || displayName || "anon";
      broadcast({ id: `r:${target}:${emoji}:${who}`, kind: "reaction", author: who, text: emoji, ts: Date.now(), target });
    },
    [broadcast, identity, displayName],
  );

  const postSystem = useCallback(
    (id: string, text: string) => {
      if (posted.current.has(id)) return;
      posted.current.add(id);
      const event: FeedEvent = { id, kind: "system", author: "", text, ts: Date.now() };
      if (!channelRef.current || !ready) {
        pending.current.push(event); // flushed on SUBSCRIBED; still persisted below
      }
      broadcast(event);
    },
    [broadcast, ready],
  );

  return { enabled: FEED_ENABLED, ready, events, present, sendMessage, sendReaction, postSystem };
}
