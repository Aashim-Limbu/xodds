"use client";

import { useCallback, useEffect, useState } from "react";
import { emailLocalPart, feedDisplayName } from "./format";
import { upsertMe } from "./groups";
import { supabase } from "./supabase";
import { useFinalWhistle } from "./useFinalWhistle";

/**
 * The single source of truth for "what name do I appear as" — used by both the Group home
 * (page.tsx) and the Pool page (PoolView), so a custom name shows up in the Feed, the roster,
 * and the leaderboard everywhere.
 *
 * Resolution: a saved `users.display_name` that isn't a raw email wins; otherwise the email
 * local-part (never the full email — that would leak into the public Feed). On load it also
 * seeds/cleans the row so friend-search and future loads never show a full email again. This
 * replaces the old unconditional email upsert at sign-in, which clobbered custom names.
 */
export function useMyName(): {
  name: string;
  saveName: (raw: string) => Promise<void>;
  /** true = first run, must pick a nickname before using the app; undefined = still loading. */
  needsOnboarding: boolean | undefined;
} {
  const { email, address, getAccessToken } = useFinalWhistle();
  const fallback = feedDisplayName(email, address); // local-part / short wallet / "anon"
  const [custom, setCustom] = useState<string | null>(null);
  const [needsOnboarding, setNeeds] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    if (!address) return;
    // No backend configured — don't block the app behind an onboarding it can't complete.
    if (!supabase) return setNeeds(false);
    let alive = true;
    void (async () => {
      const { data } = await supabase!.from("users").select("display_name").eq("wallet", address).maybeSingle();
      if (!alive) return;
      const stored = data?.display_name?.trim();
      // A real nickname is one the User actually chose: non-empty, not a raw email ("@" = legacy
      // default), and not merely their email local-part (an auto-derived default). Anything else
      // is first-run → gate on onboarding instead of letting a default slip through.
      // ponytail: "chosen vs defaulted" is inferred by value, so a User who deliberately picks
      // their own local-part re-sees the gate next login. Add a users.onboarded flag if that bites.
      const hasNickname = !!stored && !stored.includes("@") && stored !== emailLocalPart(email);
      setCustom(hasNickname ? stored! : null);
      setNeeds(!hasNickname);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, email]);

  const saveName = useCallback(
    async (raw: string) => {
      const next = raw.trim().replace(/@/g, "").slice(0, 24); // "@" reserved to mark legacy defaults
      if (!next) return;
      setCustom(next); // optimistic — the header/card update immediately
      setNeeds(false); // clears the onboarding gate
      const t = await getAccessToken().catch(() => null);
      if (t) await upsertMe(t, next, email ?? null).catch(() => {});
    },
    [getAccessToken, email],
  );

  return { name: custom ?? fallback, saveName, needsOnboarding };
}
