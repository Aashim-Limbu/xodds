"use client";

import { useFinalWhistle } from "@/lib/useFinalWhistle";

function short(addr: string): string {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

/** Sign-in control: email/social login and the embedded-wallet address when signed in. */
export function SignIn() {
  const { ready, authenticated, login, logout, address, email } = useFinalWhistle();

  if (!ready) return <span className="muted">Loading…</span>;

  if (!authenticated) {
    return <button onClick={login}>Sign in</button>;
  }

  return (
    <div className="row">
      <div className="stack" style={{ gap: 2, alignItems: "flex-end" }}>
        {email && <span className="muted" style={{ fontSize: 13 }}>{email}</span>}
        {address && <span className="odds">{short(address)}</span>}
      </div>
      <button className="secondary" onClick={logout}>Sign out</button>
    </div>
  );
}
