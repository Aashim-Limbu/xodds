import { Keypair, PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./config";

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

/** Add a Group (from an invite link) if not already present. */
export function joinGroup(group: Group): void {
  if (group.id === GLOBAL_GROUP.id) return;
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
