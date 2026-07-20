"use client";

import { Face } from "@/components/Avatars";
import { useFinalWhistle } from "@/lib/useFinalWhistle";
import { useMyName } from "@/lib/useMyName";

function short(addr: string): string {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

/** Sign-in control: email/social login and the embedded-wallet address when signed in. */
export function SignIn() {
  const { ready, authenticated, login, logout, address } = useFinalWhistle();
  // The nav shows who you are to the Group, not your login. useMyName is the same source the
  // Feed and leaderboard use, so the header can never disagree with them.
  const { name } = useMyName();

  if (!ready) return <span className="muted">Loading…</span>;

  if (!authenticated) {
    return <button onClick={login}>Sign in</button>;
  }

  return (
    <div className="row">
      <Face id={address || name} size={32} />
      <div className="stack" style={{ gap: 2, alignItems: "flex-end" }}>
        <span className="nav-name">{name}</span>
        {address && <span className="odds">{short(address)}</span>}
      </div>
      <button className="secondary" onClick={logout}>Sign out</button>
    </div>
  );
}
