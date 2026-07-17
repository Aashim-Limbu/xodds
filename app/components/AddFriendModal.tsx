"use client";

import { useEffect, useState } from "react";
import { type Group, type GroupMember, inviteUrl, searchUsers, type UserHit } from "@/lib/groups";
import { Modal } from "./Modal";

/** Everything social in one place: share the invite link, search the user registry and
 * invite by name, and see the roster (members + pending INVITED). Absorbs InviteModal. */
export function AddFriendModal({
  open,
  onClose,
  group,
  members,
  selfWallet,
  onInvite,
}: {
  open: boolean;
  onClose: () => void;
  group: Group;
  members: GroupMember[];
  selfWallet: string | null;
  onInvite: (wallet: string) => Promise<void>;
}) {
  const url = inviteUrl(group);
  const [copied, setCopied] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<UserHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");

  // Debounced live search against the public users registry.
  useEffect(() => {
    if (!open) return;
    if (q.trim().length < 2) {
      setHits([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const t = setTimeout(
      () => void searchUsers(q).then(setHits).finally(() => setSearching(false)),
      250,
    );
    return () => clearTimeout(t);
  }, [q, open]);

  useEffect(() => {
    if (!open) {
      setQ("");
      setHits([]);
      setSent(new Set());
      setError("");
    }
  }, [open]);

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  async function share() {
    if (navigator.share) {
      await navigator.share({ title: `Join ${group.name} on xOdds`, url }).catch(() => {});
    } else {
      await copy();
    }
  }

  async function invite(wallet: string) {
    setError("");
    try {
      await onInvite(wallet);
      setSent((s) => new Set(s).add(wallet));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invite failed — try again.");
    }
  }

  const inGroup = new Map(members.map((m) => [m.wallet, m.status]));

  return (
    <Modal open={open} onClose={onClose} title="Add a Friend" icon="group_add"
      sub="Send the link, or find them by name. The more, the merrier (and the bigger the pot).">
      <div className="stack" style={{ gap: 16 }}>
        <div className="field">
          <label className="field-label">Share invite link</label>
          <div className="link-row">
            <input
              className="link-input"
              readOnly
              value={url}
              onClick={(e) => e.currentTarget.select()}
              aria-label="Invite link"
            />
            <button className="copy-btn" title="Copy link" aria-label="Copy link" onClick={copy}>
              <span className="msym">{copied ? "check" : "content_copy"}</span>
            </button>
            <button className="copy-btn" title="Share" aria-label="Share link" onClick={share}>
              <span className="msym">ios_share</span>
            </button>
          </div>
        </div>

        <div className="field">
          <label className="field-label" htmlFor="friend-search">Find a friend</label>
          <input
            id="friend-search"
            value={q}
            placeholder="Search by name or email…"
            onChange={(e) => setQ(e.target.value)}
          />
          {q.trim().length >= 2 && (
            <div className="stack" style={{ gap: 8, marginTop: 8 }} aria-live="polite">
              {searching ? (
                <div className="friend-row muted">
                  <span className="friend-avatar pulse" aria-hidden="true" />
                  Searching…
                </div>
              ) : hits.filter((h) => h.wallet !== selfWallet).length === 0 ? (
                <span className="muted">No one found — they need to sign in once to be searchable. Send the link instead.</span>
              ) : (
                hits.filter((h) => h.wallet !== selfWallet).map((h) => {
                  const status = sent.has(h.wallet) ? "invited" : inGroup.get(h.wallet);
                  // display_name defaults to the email — don't print the same string twice
                  const subtitle = h.email && h.email !== h.name ? h.email : `${h.wallet.slice(0, 4)}…${h.wallet.slice(-4)}`;
                  return (
                    <div key={h.wallet} className="friend-row">
                      <span className="friend-avatar" aria-hidden="true">{h.name.slice(0, 1).toUpperCase()}</span>
                      <span className="friend-id">
                        <strong>{h.name}</strong>
                        <span className="muted">{subtitle}</span>
                      </span>
                      {status === "member" ? (
                        <span className="badge">IN GROUP</span>
                      ) : status === "invited" ? (
                        <span className="badge badge-wc">INVITED ✓</span>
                      ) : (
                        <button onClick={() => invite(h.wallet)}>Invite</button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {error && <span className="form-error" role="alert">{error}</span>}

        {members.length > 0 && (
          <div className="field">
            <label className="field-label">Squad</label>
            <div className="stack" style={{ gap: 6 }}>
              {members.map((m) => (
                <div key={m.wallet} className="row between">
                  <strong>{m.name}</strong>
                  {m.status === "invited" && <span className="badge">INVITED</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
