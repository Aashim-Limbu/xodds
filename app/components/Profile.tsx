"use client";

import { useState } from "react";

/** The Profile tab: who you are in the Group and the account you're playing with. */
export function Profile({
  email,
  wallet,
  displayName,
  onSignOut,
}: {
  email: string | null;
  wallet: string | null;
  displayName: string;
  onSignOut: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copyWallet() {
    if (!wallet) return;
    await navigator.clipboard.writeText(wallet);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="panel stack" style={{ gap: 14 }}>
      <h2>Profile</h2>
      <div>
        <div className="label muted">Shows up in the Feed as</div>
        <div style={{ fontSize: 20, fontWeight: 800 }}>{displayName}</div>
      </div>
      {email && (
        <div>
          <div className="label muted">Email</div>
          <div>{email}</div>
        </div>
      )}
      {wallet && (
        <div>
          <div className="label muted">Wallet</div>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <code style={{ wordBreak: "break-all" }}>{wallet}</code>
            <button className="secondary" onClick={copyWallet}>{copied ? "Copied!" : "Copy"}</button>
          </div>
        </div>
      )}
      <div className="row">
        <button className="secondary" onClick={onSignOut}>Sign out</button>
      </div>
    </div>
  );
}
