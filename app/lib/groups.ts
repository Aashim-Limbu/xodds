import { Keypair, PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./config";
import { supabase } from "./supabase";

// A Group is a named friend-set that owns Pools. On-chain it's just the `group` pubkey
// stored on each Pool (the first Pool PDA seed) — no Group account yet (Track B v0). The
// pubkey is a namespace/seed; nothing signs as the Group, so a fresh random pubkey is a
// fine Group id. Membership lives client-side (localStorage); the invite link carries the
// Group so "send the link" IS the join flow.

export interface Group {
  id: string; // base58 group pubkey — the Pool PDA `group` seed
  name: string;
}

/** The built-in public Group every User shares (id = program id); holds the app-wide Pools. */
export const GLOBAL_GROUP: Group = { id: PROGRAM_ID.toBase58(), name: "Global" };

const GROUPS_KEY = "fw.groups";
const ACTIVE_KEY = "fw.activeGroup";

function read(): Group[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(GROUPS_KEY) ?? "[]") as Group[];
  } catch {
    return [];
  }
}

function write(groups: Group[]): void {
  localStorage.setItem(GROUPS_KEY, JSON.stringify(groups));
}

/** Joined/created Groups, always including the built-in Global first. */
export function listGroups(): Group[] {
  const custom = read().filter((g) => g.id !== GLOBAL_GROUP.id);
  return [GLOBAL_GROUP, ...custom];
}

/** Create a new friend Group with a fresh random id, persist and return it. */
export function createGroup(name: string): Group {
  const group: Group = { id: Keypair.generate().publicKey.toBase58(), name: name.trim() || "My Group" };
  const groups = read();
  if (!groups.some((g) => g.id === group.id)) write([...groups, group]);
  return group;
}

/** Add a Group (from an invite link) if not already present. Rejects ids that aren't valid
 * pubkeys — persisting one would make every later groupPubkey() call throw on page load. */
export function joinGroup(group: Group): void {
  if (group.id === GLOBAL_GROUP.id) return;
  try {
    new PublicKey(group.id);
  } catch {
    return; // malformed invite link — ignore rather than wedge the app
  }
  const groups = read();
  if (!groups.some((g) => g.id === group.id)) write([...groups, { ...group, name: group.name || "Group" }]);
}

export function getActiveGroupId(): string {
  if (typeof window === "undefined") return GLOBAL_GROUP.id;
  return localStorage.getItem(ACTIVE_KEY) ?? GLOBAL_GROUP.id;
}

export function setActiveGroupId(id: string): void {
  localStorage.setItem(ACTIVE_KEY, id);
}

/** A shareable link that joins the Group and makes it active — the invite IS the group. */
export function inviteUrl(group: Group): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/?join=${group.id}&name=${encodeURIComponent(group.name)}`;
}

export function groupPubkey(id: string): PublicKey {
  return new PublicKey(id);
}

// ---- Shared membership (Supabase `group_members`, see DEMO.md SQL) ----
// localStorage stays the fast cache; Supabase makes membership real: a Group follows its
// members across devices and everyone can see who's in. Optional like the Feed — without
// Supabase everything degrades back to local-only.

export interface GroupMember {
  wallet: string;
  name: string;
}

/** Record that `wallet` belongs to `group`. No-op for Global / without Supabase.
 * Insert-once keeps `ts` = join time (the roster's "oldest first" order); a second pass
 * refreshes only the display name so renames still propagate. */
export async function recordMembership(group: Group, wallet: string, name: string): Promise<void> {
  if (group.id === GLOBAL_GROUP.id || !supabase) return;
  await supabase
    .from("group_members")
    .upsert(
      { group_id: group.id, wallet, name, group_name: group.name, ts: Date.now() },
      { onConflict: "group_id,wallet", ignoreDuplicates: true },
    );
  await supabase.from("group_members").update({ name }).eq("group_id", group.id).eq("wallet", wallet);
}

/** Groups this wallet has joined from any device. Empty without Supabase. */
export async function fetchMyGroups(wallet: string): Promise<Group[]> {
  if (!supabase) return [];
  const { data } = await supabase.from("group_members").select("group_id, group_name").eq("wallet", wallet);
  return (data ?? []).map((r) => ({ id: r.group_id, name: r.group_name }));
}

/** Everyone who has joined the Group, oldest first. Empty without Supabase. */
export async function fetchMembers(groupId: string): Promise<GroupMember[]> {
  if (!supabase) return [];
  const { data } = await supabase
    .from("group_members")
    .select("wallet, name")
    .eq("group_id", groupId)
    .order("ts", { ascending: true });
  return data ?? [];
}
