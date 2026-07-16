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
import { GroupRail } from "@/components/GroupRail";
import { fetchLatestActivity, useFeed } from "@/lib/feed";
import { feedDisplayName, formatUsdc } from "@/lib/format";
import { useFinalWhistle } from "@/lib/useFinalWhistle";
import { AddFriendModal } from "@/components/AddFriendModal";
import { NewGroupModal } from "@/components/NewGroupModal";
import {
  cacheGroup,
  createGroupApi,
  fetchInvites,
  fetchMembers,
  fetchMyGroups,
  getActiveGroupId,
  GLOBAL_GROUP,
  type Group,
  type GroupInvite,
  type GroupMember,
  groupPubkey,
  inviteToGroup,
  joinGroupApi,
  leaveGroupApi,
  listGroups,
  respondToInvite,
  setActiveGroupId,
  upsertMe,
} from "@/lib/groups";

type Tab = "pools" | "syndicate" | "activity" | "profile";

const TABS: Array<{ id: Tab; label: string; icon: string }> = [
  { id: "pools", label: "Pools", icon: "sports_soccer" },
  { id: "syndicate", label: "Syndicate", icon: "groups" },
  { id: "activity", label: "Activity", icon: "receipt_long" },
  { id: "profile", label: "Profile", icon: "person" },
];

export default function Home() {
  const { authenticated, client, login, logout, email, address: wallet, getAccessToken } = useFinalWhistle();
  const [refreshKey, setRefreshKey] = useState(0);
  const [tab, setTab] = useState<Tab>("pools");
  const [groups, setGroups] = useState<Group[]>([GLOBAL_GROUP]);
  const [activeId, setActiveId] = useState<string>(GLOBAL_GROUP.id);
  const [invites, setInvites] = useState<GroupInvite[]>([]);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [membersKey, setMembersKey] = useState(0); // bump to re-fetch the roster
  // The per-Group Feed (CONTEXT.md), mounted on the Group home; Pool pages join the same channel.
  const displayName = feedDisplayName(email, wallet);
  const groupChannel = useMemo(() => `group:${groupPubkey(activeId).toBase58()}`, [activeId]);
  const feed = useFeed(authenticated ? groupChannel : "", displayName);

  // Load cached Groups and remember a pending invite link (?join=<id>&name=<name>);
  // the actual server join happens once the wallet is ready below.
  const [pendingJoin, setPendingJoin] = useState<Group | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const joinId = params.get("join");
    if (joinId) {
      const g = { id: joinId, name: params.get("name") ?? "Group" };
      cacheGroup(g); // instant UI; server-truth follows on sign-in
      setPendingJoin(g);
      setActiveGroupId(joinId);
      window.history.replaceState({}, "", "/");
    }
    setGroups(listGroups());
    setActiveId(getActiveGroupId());
  }, []);

  /** Privy access token for the verified API routes; throws when signed out. */
  async function token(): Promise<string> {
    const t = await getAccessToken();
    if (!t) throw new Error("sign in first");
    return t;
  }

  async function refreshGroups(w: string) {
    const remote = await fetchMyGroups(w);
    remote.forEach(cacheGroup);
    setGroups(listGroups());
    setInvites(await fetchInvites(w));
  }

  // Server-truth sync at sign-in: register the profile (makes you searchable), complete a
  // pending invite-link join, then pull memberships + invites from any device.
  useEffect(() => {
    if (!wallet) return;
    void (async () => {
      const t = await token().catch(() => null);
      if (t) {
        await upsertMe(t, displayName, email).catch(() => {});
        if (pendingJoin) {
          await joinGroupApi(t, pendingJoin).catch(() => {});
          setPendingJoin(null);
        }
      }
      await refreshGroups(wallet);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet, displayName, email, pendingJoin]);

  // The active Group's roster (Syndicate tab + Add a Friend modal). Reset on switch and
  // guard against an earlier, slower fetch landing after a rapid group change.
  const [members, setMembers] = useState<GroupMember[]>([]);
  useEffect(() => {
    setMembers([]);
    if (tab !== "syndicate" && !showAddFriend) return;
    let cancelled = false;
    void fetchMembers(activeId).then((m) => {
      if (!cancelled) setMembers(m);
    });
    return () => {
      cancelled = true;
    };
  }, [tab, activeId, wallet, showAddFriend, membersKey]);

  function switchGroup(id: string) {
    localStorage.setItem(`fw.groupSeen:${activeId}`, String(Date.now())); // leaving = caught up
    setActiveGroupId(id);
    setActiveId(id);
  }

  // Unread dots for the rail: any Group whose feed has events newer than when you last
  // had it active. Refreshed on load and on every switch; the active Group stays caught up.
  const [unread, setUnread] = useState<Set<string>>(new Set());
  useEffect(() => {
    localStorage.setItem(`fw.groupSeen:${activeId}`, String(Date.now()));
    const others = groups.filter((g) => g.id !== activeId);
    if (others.length === 0) return;
    void fetchLatestActivity(others.map((g) => `group:${groupPubkey(g.id).toBase58()}`)).then((latest) => {
      const dots = new Set<string>();
      for (const g of others) {
        const last = latest.get(`group:${groupPubkey(g.id).toBase58()}`) ?? 0;
        const seen = Number(localStorage.getItem(`fw.groupSeen:${g.id}`)) || 0;
        if (last > seen) dots.add(g.id);
      }
      setUnread(dots);
    });
  }, [groups, activeId]);

  // Live cash pot: sum of the Group's open+locked Pool pots (the money on the table).
  const [potTotal, setPotTotal] = useState<string | null>(null);
  useEffect(() => {
    setPotTotal(null);
    if (!client) return;
    let cancelled = false;
    void client.listPools(groupPubkey(activeId)).then((pools) => {
      if (cancelled) return;
      const sum = pools
        .filter((p) => p.state === "open" || p.state === "locked")
        .reduce((acc, p) => acc + p.pot, 0n);
      setPotTotal(sum > 0n ? formatUsdc(sum) : null);
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [client, activeId, refreshKey]);

  async function create(name: string) {
    const g = await createGroupApi(await token(), name);
    setGroups(listGroups());
    switchGroup(g.id);
    setShowAddFriend(true); // fresh group -> rally the squad immediately
  }

  async function invite(w: string) {
    await inviteToGroup(await token(), activeId, w);
    setMembersKey((k) => k + 1);
  }

  async function respond(inv: GroupInvite, accept: boolean) {
    await respondToInvite(await token(), inv.group.id, accept);
    if (accept) {
      cacheGroup(inv.group);
      setGroups(listGroups());
      switchGroup(inv.group.id);
    }
    if (wallet) setInvites(await fetchInvites(wallet));
  }

  async function leave() {
    await leaveGroupApi(await token(), activeId);
    setGroups(listGroups());
    switchGroup(GLOBAL_GROUP.id);
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
            <NotificationsBell events={feed.events} groupId={activeId} inviteCount={invites.length} />
            <button className="nav-icon-btn" aria-label="Sign out" title="Sign out" onClick={logout}>
              <span className="msym">account_circle</span>
            </button>
          </div>
        </div>
      </nav>
      <div className="container">
        <GroupRail
          groups={groups}
          activeId={activeId}
          invites={invites}
          unread={unread}
          onSwitch={switchGroup}
          onNew={() => setShowNewGroup(true)}
          onRespond={(inv, accept) => void respond(inv, accept)}
        />
        <GroupBar
          groups={groups}
          activeId={activeId}
          onAddFriend={() => setShowAddFriend(true)}
          potTotal={potTotal}
          online={feed.present}
        />
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
                <span className="muted">Nobody else is here — hit ADD A FRIEND in the banner above.</span>
              ) : (
                members.map((m) => (
                  <div key={m.wallet} className="row between">
                    <span className="row"><span className="msym">person</span><strong>{m.name}</strong></span>
                    <span className="row" style={{ gap: 6 }}>
                      {m.status === "invited" && <span className="badge">INVITED</span>}
                      {feed.present.includes(m.name) && <span className="badge">ONLINE</span>}
                    </span>
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
              {activeId !== GLOBAL_GROUP.id && (
                <div className="row" style={{ marginTop: 8 }}>
                  <button className="secondary" onClick={() => void leave()}>
                    <span className="msym" style={{ fontSize: 16, verticalAlign: "-3px" }}>logout</span> Leave Group
                  </button>
                </div>
              )}
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
      <NewGroupModal open={showNewGroup} onClose={() => setShowNewGroup(false)} onCreate={create} />
      <AddFriendModal
        open={showAddFriend}
        onClose={() => setShowAddFriend(false)}
        group={groups.find((g) => g.id === activeId) ?? GLOBAL_GROUP}
        members={members}
        selfWallet={wallet}
        onInvite={invite}
      />
    </>
  );
}
