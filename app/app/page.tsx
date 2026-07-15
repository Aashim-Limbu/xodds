"use client";

import { useEffect, useMemo, useState } from "react";
import { NotificationsBell } from "@/components/NotificationsBell";
import { Profile } from "@/components/Profile";
import { SignIn } from "@/components/SignIn";
import { Feed } from "@/components/Feed";
import { Leaderboard } from "@/components/Leaderboard";
import { CreatePool } from "@/components/CreatePool";
import { GetTestFunds } from "@/components/GetTestFunds";
import { GroupBar } from "@/components/GroupBar";
import { PoolList } from "@/components/PoolList";
import { XMark } from "@/components/stickers";
import { useFeed } from "@/lib/feed";
import { feedDisplayName } from "@/lib/format";
import { useFinalWhistle } from "@/lib/useFinalWhistle";
import {
  createGroup,
  fetchMembers,
  fetchMyGroups,
  getActiveGroupId,
  GLOBAL_GROUP,
  type Group,
  type GroupMember,
  groupPubkey,
  joinGroup,
  listGroups,
  recordMembership,
  setActiveGroupId,
} from "@/lib/groups";

type Tab = "pools" | "syndicate" | "activity" | "profile";

const TABS: Array<{ id: Tab; label: string; icon: string }> = [
  { id: "pools", label: "Pools", icon: "sports_soccer" },
  { id: "syndicate", label: "Syndicate", icon: "groups" },
  { id: "activity", label: "Activity", icon: "receipt_long" },
  { id: "profile", label: "Profile", icon: "person" },
];

export default function Home() {
  const { authenticated, client, login, logout, email, address: wallet } = useFinalWhistle();
  const [refreshKey, setRefreshKey] = useState(0);
  const [tab, setTab] = useState<Tab>("pools");
  const [groups, setGroups] = useState<Group[]>([GLOBAL_GROUP]);
  const [activeId, setActiveId] = useState<string>(GLOBAL_GROUP.id);
  // The per-Group Feed (CONTEXT.md), mounted on the Group home; Pool pages join the same channel.
  const displayName = feedDisplayName(email, wallet);
  const groupChannel = useMemo(() => `group:${groupPubkey(activeId).toBase58()}`, [activeId]);
  const feed = useFeed(authenticated ? groupChannel : "", displayName);

  // Load Groups from storage and honour an invite link (?join=<id>&name=<name>).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const joinId = params.get("join");
    if (joinId) {
      joinGroup({ id: joinId, name: params.get("name") ?? "Group" });
      setActiveGroupId(joinId);
      window.history.replaceState({}, "", "/");
    }
    setGroups(listGroups());
    setActiveId(getActiveGroupId());
  }, []);

  // Shared membership: once the wallet is known, pull Groups joined on other devices into
  // the local list, and register every locally-known Group (create or invite-link join)
  // under this wallet so teammates see you and you survive a device switch.
  useEffect(() => {
    if (!wallet) return;
    void (async () => {
      const remote = await fetchMyGroups(wallet);
      remote.forEach(joinGroup);
      setGroups(listGroups());
      for (const g of listGroups()) void recordMembership(g, wallet, displayName);
    })();
  }, [wallet, displayName]);

  // The active Group's member roster (Syndicate tab). Reset on switch and guard against
  // an earlier, slower fetch landing after a rapid group change.
  const [members, setMembers] = useState<GroupMember[]>([]);
  useEffect(() => {
    setMembers([]);
    if (tab !== "syndicate") return;
    let cancelled = false;
    void fetchMembers(activeId).then((m) => {
      if (!cancelled) setMembers(m);
    });
    return () => {
      cancelled = true;
    };
  }, [tab, activeId, wallet]);

  function switchGroup(id: string) {
    setActiveGroupId(id);
    setActiveId(id);
  }

  function create(name: string) {
    const g = createGroup(name);
    setGroups(listGroups());
    switchGroup(g.id);
    if (wallet) void recordMembership(g, wallet, displayName);
  }

  // Sticker frame — real art cropped from the Stitch screens (public/stickers/*), rotation and
  // die-cut shadow baked in. Only complete stickers float freely; crops whose art was cut at a
  // screen edge in the mockup (br, us, ball-left/right) sit flush against that same edge here.
  const STICKERS: Array<[string, React.CSSProperties, boolean?]> = [
    ["trophy", { top: "10%", left: "6%" }],
    ["whistle-a", { top: "11%", left: "16%" }, true],
    ["ball-full", { top: "5.5%", left: "33%" }],
    ["fr", { top: "6.5%", left: "45%" }],
    ["jp-a", { top: "6%", left: "57%" }, true],
    ["floodlight", { top: "5%", left: "70%" }],
    ["trophy", { top: "10%", right: "25%" }],
    ["whistle-b", { top: "15.5%", right: "11.5%" }],
    ["br", { top: "23%", left: 0 }],
    ["ball-full", { top: "30%", right: "7.5%" }, true],
    ["cleat-a", { top: "37%", left: "9.7%" }, true],
    ["ball-left", { top: "42%", left: 0 }, true],
    ["ar", { top: "54%", left: "7%" }, true],
    ["cleat-b", { top: "50%", right: "7%" }, true],
    ["fr", { top: "65%", right: "10%" }, true],
    ["cleat-c", { top: "74%", left: "7.3%" }],
    ["cleat-c", { top: "74.5%", right: "7.5%" }],
    ["us", { top: "79%", right: 0 }],
  ];

  if (!authenticated || !client) {
    return (
      <div className="landing">
        <header className="landing-nav">
          <div className="brand"><span>x</span>Odds</div>
          <SignIn />
        </header>
        {STICKERS.map(([name, pos, mid], i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={i}
            className={`stick${mid ? " stick-mid" : ""}`}
            src={`/stickers/${name}.png`}
            alt=""
            aria-hidden="true"
            style={pos}
          />
        ))}
        <main className="landing-center">
          <div className="logo-mega">
            <XMark size={92} />
            <span>Odds</span>
          </div>
          <p className="landing-tag">The Social Way to Bet.</p>
          <div className="row" style={{ gap: 14, marginTop: 6 }}>
            <button className="pill" onClick={login}>Get started</button>
            <button className="pill secondary" onClick={login}>Log in</button>
          </div>
        </main>
        <footer className="landing-footer">
          <a href="/legal#terms">Terms &amp; Conditions</a>
          <a href="/legal#privacy">Privacy Policy</a>
          <a href="/legal#responsible">Responsible Gaming</a>
        </footer>
      </div>
    );
  }

  return (
    <>
      <nav className="dash-nav">
        <div className="dash-nav-inner">
          <div className="brand"><span>x</span>Odds</div>
          <div className="nav-links">
            {TABS.map((t) => (
              <button
                key={t.id}
                className="nav-link"
                aria-current={tab === t.id ? "page" : undefined}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="nav-right">
            <NotificationsBell events={feed.events} groupId={activeId} />
            <button className="nav-icon-btn" aria-label="Sign out" title="Sign out" onClick={logout}>
              <span className="msym">account_circle</span>
            </button>
          </div>
        </div>
      </nav>
      <div className="container">
        <GroupBar groups={groups} activeId={activeId} onSwitch={switchGroup} onCreate={create} online={feed.present} />
        {tab === "pools" && (
          <>
            <GetTestFunds />
            <CreatePool group={groupPubkey(activeId)} onCreated={() => setRefreshKey((k) => k + 1)} />
            <PoolList group={groupPubkey(activeId)} refreshKey={refreshKey} />
          </>
        )}
        {tab === "syndicate" && (
          <>
            <Leaderboard groupChannel={groupChannel} />
            <div className="panel stack">
              <h2>Members</h2>
              {members.length === 0 && feed.present.length === 0 ? (
                <span className="muted">Nobody else is here — send the invite link from the banner above.</span>
              ) : (
                members.map((m) => (
                  <div key={m.wallet} className="row between">
                    <span className="row"><span className="msym">person</span><strong>{m.name}</strong></span>
                    {feed.present.includes(m.name) && <span className="badge">ONLINE</span>}
                  </div>
                ))
              )}
              {/* presence not yet in the members table (e.g. Supabase table missing) still shows */}
              {feed.present
                .filter((name) => !members.some((m) => m.name === name))
                .map((name) => (
                  <div key={name} className="row between">
                    <span className="row"><span className="msym">person</span><strong>{name}</strong></span>
                    <span className="badge">ONLINE</span>
                  </div>
                ))}
            </div>
          </>
        )}
        {tab === "activity" && <Feed feed={feed} />}
        {tab === "profile" && <Profile email={email} wallet={wallet} displayName={displayName} onSignOut={logout} />}
      </div>
      <nav className="bottom-nav">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`bn-item${tab === t.id ? " active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            <span className="msym">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>
    </>
  );
}
