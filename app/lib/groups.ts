import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./config";
import { supabase } from "./supabase";

// A Group is a named friend-set that owns Pools. On-chain it's just the `group` pubkey
// stored on each Pool (the first Pool PDA seed). Since v2, Groups and membership are
// server-truth (Supabase `groups`/`group_members`, written only by the verified API
// routes); localStorage is a per-device cache so the UI renders instantly offline.

export interface Group {
  id: string; // base58 group pubkey — the Pool PDA `group` seed
  name: string;
}

export interface GroupMember {
  wallet: string;
  name: string;
  status: "member" | "invited";
}

export interface GroupInvite {
  group: Group;
  invitedBy: string;
}

export interface UserHit {
  wallet: string;
  name: string;
  email: string | null;
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

/** Cached Groups, always including the built-in Global first. */
export function listGroups(): Group[] {
  const custom = read().filter((g) => g.id !== GLOBAL_GROUP.id);
  return [GLOBAL_GROUP, ...custom];
}

/** Add a Group to the device cache. Rejects ids that aren't valid pubkeys — persisting one
 * would make every later groupPubkey() call throw on page load. */
export function cacheGroup(group: Group): void {
  if (group.id === GLOBAL_GROUP.id) return;
  try {
    new PublicKey(group.id);
  } catch {
    return; // malformed invite link — ignore rather than wedge the app
  }
  const groups = read().filter((g) => g.id !== group.id);
  write([...groups, { ...group, name: group.name || "Group" }]);
}

export function uncacheGroup(id: string): void {
  write(read().filter((g) => g.id !== id));
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

// ---- Server-verified writes (Next API routes; token = Privy access token) ----

async function api<T>(path: string, token: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(json.error ?? `request failed (${res.status})`);
  return json;
}

/** Register/refresh the caller's profile — makes them findable in friend search. */
export const upsertMe = (token: string, name: string, email: string | null) =>
  api<{ ok: true }>("/api/me", token, { name, email });

export async function createGroupApi(token: string, name: string): Promise<Group> {
  const g = await api<Group>("/api/groups", token, { name });
  cacheGroup(g);
  return g;
}

export async function joinGroupApi(token: string, group: Group): Promise<void> {
  await api("/api/groups/join", token, { groupId: group.id, name: group.name });
  cacheGroup(group);
}

export const inviteToGroup = (token: string, groupId: string, wallet: string) =>
  api<{ ok: true }>("/api/groups/invite", token, { groupId, wallet });

export async function respondToInvite(token: string, groupId: string, accept: boolean): Promise<void> {
  await api("/api/groups/respond", token, { groupId, accept });
}

export async function leaveGroupApi(token: string, groupId: string): Promise<void> {
  await api("/api/groups/leave", token, { groupId });
  uncacheGroup(groupId);
}

// ---- Public reads (anon key; RLS = select-only) ----
// No FKs on these tables (rows may precede profiles), so "joins" are explicit second
// lookups instead of PostgREST embeds.

async function groupNames(ids: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (ids.length && supabase) {
    const { data } = await supabase.from("groups").select("id, name").in("id", ids);
    for (const g of data ?? []) names.set(g.id, g.name);
  }
  return names;
}

async function userNames(wallets: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (wallets.length && supabase) {
    const { data } = await supabase.from("users").select("wallet, display_name").in("wallet", wallets);
    for (const u of data ?? []) names.set(u.wallet, u.display_name);
  }
  return names;
}

/** Groups this wallet is a member of, from any device. Empty without Supabase. */
export async function fetchMyGroups(wallet: string): Promise<Group[]> {
  if (!supabase) return [];
  const { data } = await supabase
    .from("group_members")
    .select("group_id")
    .eq("wallet", wallet)
    .eq("status", "member");
  const ids = (data ?? []).map((r) => r.group_id);
  const names = await groupNames(ids);
  return ids.map((id) => ({ id, name: names.get(id) ?? "Group" }));
}

/** Pending invites for this wallet, with inviter display names when known. */
export async function fetchInvites(wallet: string): Promise<GroupInvite[]> {
  if (!supabase) return [];
  const { data } = await supabase
    .from("group_members")
    .select("group_id, invited_by")
    .eq("wallet", wallet)
    .eq("status", "invited");
  const rows = data ?? [];
  const [groups, inviters] = await Promise.all([
    groupNames(rows.map((r) => r.group_id)),
    userNames(rows.map((r) => r.invited_by).filter(Boolean) as string[]),
  ]);
  return rows.map((r) => ({
    group: { id: r.group_id, name: groups.get(r.group_id) ?? "Group" },
    invitedBy: inviters.get(r.invited_by ?? "") ?? "a member",
  }));
}

/** The Group's roster (members + pending invites), oldest first, with profile names. */
export async function fetchMembers(groupId: string): Promise<GroupMember[]> {
  if (!supabase) return [];
  const { data } = await supabase
    .from("group_members")
    .select("wallet, status")
    .eq("group_id", groupId)
    .order("ts", { ascending: true });
  const rows = data ?? [];
  const names = await userNames(rows.map((r) => r.wallet));
  return rows.map((r) => ({
    wallet: r.wallet,
    status: r.status as "member" | "invited",
    name: names.get(r.wallet) ?? `${r.wallet.slice(0, 6)}…`,
  }));
}

/** Friend search over the public users registry (name or email substring). */
export async function searchUsers(q: string): Promise<UserHit[]> {
  if (!supabase || q.trim().length < 2) return [];
  const needle = q.trim().replaceAll("%", "");
  const { data } = await supabase
    .from("users")
    .select("wallet, display_name, email")
    .or(`display_name.ilike.%${needle}%,email.ilike.%${needle}%`)
    .limit(8);
  return (data ?? []).map((u) => ({ wallet: u.wallet, name: u.display_name, email: u.email }));
}
