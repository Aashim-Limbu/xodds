"use client";

import { SignIn } from "./SignIn";

export type Tab = "pools" | "syndicate" | "activity" | "profile";

export const TABS: Array<{ id: Tab; label: string; icon: string }> = [
  { id: "pools", label: "Pools", icon: "sports_soccer" },
  { id: "syndicate", label: "Syndicate", icon: "groups" },
  { id: "activity", label: "Activity", icon: "receipt_long" },
  { id: "profile", label: "Profile", icon: "person" },
];

/** The one navbar, shared by every signed-in screen: brand, tabs, and the identity block
 * (email + wallet + sign out, via SignIn). `active` marks the current tab; `onTab` handles
 * selection — the home page switches state, other pages navigate home. */
export function NavBar({
  active,
  onTab,
  extra,
}: {
  active?: Tab;
  onTab: (t: Tab) => void;
  /** Extra right-side content (e.g. the notifications bell), rendered before the identity. */
  extra?: React.ReactNode;
}) {
  return (
    <nav className="dash-nav">
      <div className="dash-nav-inner">
        <div className="brand"><span>x</span>Odds</div>
        <div className="nav-links">
          {TABS.map((t) => (
            <button
              key={t.id}
              className="nav-link"
              aria-current={active === t.id ? "page" : undefined}
              onClick={() => onTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="nav-right">
          {extra}
          <SignIn />
        </div>
      </div>
    </nav>
  );
}

/** The matching mobile bottom nav. */
export function BottomNav({ active, onTab }: { active?: Tab; onTab: (t: Tab) => void }) {
  return (
    <nav className="bottom-nav">
      {TABS.map((t) => (
        <button
          key={t.id}
          className={`bn-item${active === t.id ? " active" : ""}`}
          onClick={() => onTab(t.id)}
        >
          <span className="msym">{t.icon}</span>
          {t.label}
        </button>
      ))}
    </nav>
  );
}
