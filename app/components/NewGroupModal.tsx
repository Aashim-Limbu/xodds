"use client";

import { useState } from "react";
import { Modal } from "./Modal";

/** Name-and-create a Group — replaces the window.prompt. */
export function NewGroupModal({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function create(ev: React.FormEvent) {
    ev.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      await onCreate(name.trim());
      setName("");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create the Group — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New Group" icon="add_circle"
      sub="Name your syndicate. You'll invite the squad right after.">
      <form className="stack" style={{ gap: 12 }} onSubmit={create}>
        <div className="field">
          <label className="field-label" htmlFor="group-name">Group name</label>
          <input
            id="group-name"
            value={name}
            maxLength={32}
            placeholder="Sunday League Legends"
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        {error && <span className="form-error" role="alert">{error}</span>}
        <button type="submit" disabled={!name.trim() || busy}>
          {busy ? "Creating…" : "Create Group"}
        </button>
      </form>
    </Modal>
  );
}
