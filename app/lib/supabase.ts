import { createClient } from "@supabase/supabase-js";
import { FEED_ENABLED, SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

// Single shared Supabase client (rented realtime + persistence, ADR-0006). Anon key only.
// null when unconfigured — callers degrade gracefully (Feed ephemeral, leaderboard empty).
export const supabase = FEED_ENABLED ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
