"use client";

import { createClient, type RealtimeChannel } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";
import { FEED_ENABLED, SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

// A single shared Supabase client (rented realtime, ADR-0006). Anon key only — the Feed
// uses Realtime channels (presence + broadcast), so no privileged access is needed.
const supabase = FEED_ENABLED ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

export type FeedEventKind = "message" | "reaction" | "system";

export interface FeedEvent {
  id: string;
  kind: FeedEventKind;
  author: string; // display name; "" for system posts
  text: string; // message text, reaction emoji, or system line
  ts: number;
}

export interface FeedApi {
  enabled: boolean;
  ready: boolean;
  events: FeedEvent[];
  present: string[]; // display names currently viewing this Pool
  sendMessage: (text: string) => void;
  sendReaction: (emoji: string) => void;
  /** Announce a Pool action once — deduped by `id` so many observers don't repeat it. */
  postSystem: (id: string, text: string) => void;
}

/**
 * Per-Pool Feed on a Supabase Realtime channel: presence (who's here) + broadcast
 * (messages, reactions, system posts). Ephemeral by design — the live-match layer, not
 * an archive (ADR-0006 excludes threads/DMs/search).
 */
export function useFeed(poolAddress: string, displayName: string): FeedApi {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [present, setPresent] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const seen = useRef<Set<string>>(new Set());

  const add = useCallback((e: FeedEvent) => {
    if (seen.current.has(e.id)) return;
    seen.current.add(e.id);
    setEvents((prev) => [...prev, e].slice(-200));
  }, []);

  useEffect(() => {
    if (!supabase) return;
    seen.current = new Set();
    setEvents([]);
    const channel = supabase.channel(`pool:${poolAddress}`, {
      config: { broadcast: { self: true }, presence: { key: displayName || "anon" } },
    });
    channel
      .on("broadcast", { event: "feed" }, ({ payload }) => add(payload as FeedEvent))
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
        }
      });
    channelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
      setReady(false);
    };
  }, [poolAddress, displayName, add]);

  const broadcast = useCallback((event: FeedEvent) => {
    channelRef.current?.send({ type: "broadcast", event: "feed", payload: event });
  }, []);

  const randomId = () => `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;

  const sendMessage = useCallback(
    (text: string) => {
      if (!text.trim()) return;
      broadcast({ id: randomId(), kind: "message", author: displayName || "anon", text: text.trim(), ts: Date.now() });
    },
    [broadcast, displayName],
  );

  const sendReaction = useCallback(
    (emoji: string) => broadcast({ id: randomId(), kind: "reaction", author: displayName || "anon", text: emoji, ts: Date.now() }),
    [broadcast, displayName],
  );

  const postSystem = useCallback(
    (id: string, text: string) => {
      if (seen.current.has(id)) return;
      broadcast({ id, kind: "system", author: "", text, ts: Date.now() });
    },
    [broadcast],
  );

  return { enabled: FEED_ENABLED, ready, events, present, sendMessage, sendReaction, postSystem };
}
