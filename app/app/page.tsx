"use client";

import { useEffect, useState } from "react";
import { SignIn } from "@/components/SignIn";
import { CreatePool } from "@/components/CreatePool";
import { GetTestFunds } from "@/components/GetTestFunds";
import { GroupBar } from "@/components/GroupBar";
import { PoolList } from "@/components/PoolList";
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
  const { authenticated, client } = useFinalWhistle();
  const [refreshKey, setRefreshKey] = useState(0);
  const [groups, setGroups] = useState<Group[]>([GLOBAL_GROUP]);
  const [activeId, setActiveId] = useState<string>(GLOBAL_GROUP.id);

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

  return (
    <div className="container">
      <div className="header">
        <div className="brand">Final<span>Whistle</span></div>
        <SignIn />
      </div>

      {!authenticated || !client ? (
        <div className="panel">
          <h1>Back your call, settled by proof.</h1>
          <p className="muted">
            Put real USDC into shared parimutuel Pools with friends on 2026 World Cup Fixtures. Sign
            in with email — an embedded wallet is created for you, no seed phrase. Every Pool
            auto-settles from a TxLINE Score Proof, so nobody, including us, chooses the outcome.
          </p>
        </div>
      ) : (
        <>
          <GroupBar groups={groups} activeId={activeId} onSwitch={switchGroup} onCreate={create} />
          <GetTestFunds />
          <CreatePool group={groupPubkey(activeId)} onCreated={() => setRefreshKey((k) => k + 1)} />
          <h2 style={{ margin: "20px 0 12px" }}>Pools</h2>
          <PoolList group={groupPubkey(activeId)} refreshKey={refreshKey} />
        </>
      )}
    </div>
  );
}
