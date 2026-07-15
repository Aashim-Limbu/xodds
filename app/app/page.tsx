"use client";

import { useEffect, useState } from "react";
import { SignIn } from "@/components/SignIn";
import { Feed } from "@/components/Feed";
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
  getActiveGroupId,
  GLOBAL_GROUP,
  type Group,
  groupPubkey,
  joinGroup,
  listGroups,
  setActiveGroupId,
} from "@/lib/groups";

export default function Home() {
  const { authenticated, client, login, logout, email, address: wallet } = useFinalWhistle();
  const [refreshKey, setRefreshKey] = useState(0);
  const [groups, setGroups] = useState<Group[]>([GLOBAL_GROUP]);
  const [activeId, setActiveId] = useState<string>(GLOBAL_GROUP.id);
  // The per-Group Feed (CONTEXT.md), mounted on the Group home; Pool pages join the same channel.
  const displayName = feedDisplayName(email, wallet);
  const feed = useFeed(authenticated ? `group:${groupPubkey(activeId).toBase58()}` : "", displayName);

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

  function switchGroup(id: string) {
    setActiveGroupId(id);
    setActiveId(id);
  }

  function create(name: string) {
    const g = createGroup(name);
    setGroups(listGroups());
    switchGroup(g.id);
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
          <span>Terms &amp; Conditions</span>
          <span>Privacy Policy</span>
          <span>Responsible Gaming</span>
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
            <a className="nav-link" href="/" aria-current="page">Pools</a>
            <a className="nav-link" href="/">Syndicate</a>
            <a className="nav-link" href="/">Activity</a>
            <a className="nav-link" href="/">Profile</a>
          </div>
          <div className="nav-right">
            <button className="nav-icon-btn" aria-label="Notifications"><span className="msym">notifications</span></button>
            <button className="nav-icon-btn" aria-label="Sign out" title="Sign out" onClick={logout}>
              <span className="msym">account_circle</span>
            </button>
          </div>
        </div>
      </nav>
      <div className="container">
        <GroupBar groups={groups} activeId={activeId} onSwitch={switchGroup} onCreate={create} online={feed.present} />
        <GetTestFunds />
        <CreatePool group={groupPubkey(activeId)} onCreated={() => setRefreshKey((k) => k + 1)} />
        <PoolList group={groupPubkey(activeId)} refreshKey={refreshKey} />
        <Feed feed={feed} />
      </div>
      <nav className="bottom-nav">
        <a className="bn-item active" href="/"><span className="msym">sports_soccer</span>Pools</a>
        <a className="bn-item" href="/"><span className="msym">groups</span>Syndicate</a>
        <a className="bn-item" href="/"><span className="msym">receipt_long</span>Activity</a>
        <a className="bn-item" href="/"><span className="msym">person</span>Profile</a>
      </nav>
    </>
  );
}
