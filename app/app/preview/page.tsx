/* ponytail: static design-preview with mock data — mirrors the real components' markup/classes
 * so signed-in screens can be eyeballed without Privy auth. Not linked; delete when design settles. */
import { Avatars } from "@/components/Avatars";

const POOLS: Array<{ title: string; sub: string; state: string; pot: string; parts: number; seed: string }> = [
  { title: "Argentina vs Brazil", sub: "Match Winner (1X2)", state: "open", pot: "450.00", parts: 12, seed: "a" },
  { title: "France vs England", sub: "Total Goals O/U 2.5", state: "locked", pot: "1,200.00", parts: 18, seed: "b" },
  { title: "Spain vs Germany", sub: "Match Winner (1X2)", state: "settled", pot: "225.00", parts: 7, seed: "c" },
];
const ICON: Record<string, string> = { open: "⚽", locked: "🥅", settled: "🏆", void: "🎯" };
const LABEL: Record<string, string> = { open: "● Open", locked: "🔒 Locked", settled: "● Settled", void: "↩ Void" };

export default function Preview() {
  return (
    <div className="container">
      <nav className="dash-nav">
        <div className="brand"><span>x</span>Odds</div>
        <div className="nav-links">
          <a className="nav-link" href="#" aria-current="page">Pools</a>
          <a className="nav-link" href="#">Bets</a>
          <a className="nav-link" href="#">Chat</a>
        </div>
        <div className="nav-right">
          <span className="wallet-chip">4BXW…a8EH</span>
          <button className="secondary">Sign out</button>
        </div>
      </nav>

      {/* Group hero */}
      <div className="hero">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="hero-collage" src="/stickers/hero-right.png" alt="" aria-hidden="true" />
        <div className="hero-content">
          <span className="chip-id">ID: 3TWLVGXW</span>
          <h1 className="hero-title" style={{ marginTop: 8 }}>Global</h1>
          <p className="hero-sub" style={{ maxWidth: 380 }}>
            The open market — anyone can spin up a Pool on any Fixture, and anyone can join. Settled by
            proof, never by a house.
          </p>
          <div className="hero-members">
            <Avatars seed="global" count={1204} shown={4} showMore={false} />
            <span className="label">1,204 MEMBERS</span>
          </div>
          <div className="row" style={{ marginTop: 18, gap: 10 }}>
            <span className="chip-id">Group</span>
            <select defaultValue="Global"><option>Global</option></select>
            <button>+ New group</button>
          </div>
        </div>
      </div>

      {/* Active pools — dashboard cards */}
      <div className="section-head">
        <h2 className="section-title">Active Pools</h2>
        <div className="filter-pills">
          <button className="filter-pill" aria-pressed>all</button>
          <button className="filter-pill">open</button>
          <button className="filter-pill">settled</button>
        </div>
      </div>
      <div className="pool-grid">
        {POOLS.map((p) => (
          <div key={p.seed} className="panel pool-card">
            <div className={`pool-card-head is-${p.state}`}>
              <span className="pool-icon" aria-hidden="true">{ICON[p.state]}</span>
              <div style={{ minWidth: 0 }}>
                <div className="pool-card-title">{p.title}</div>
                <div className="pool-card-sub">{p.sub}</div>
              </div>
              <span className={`badge ${p.state}`} style={{ marginLeft: "auto" }}>{LABEL[p.state]}</span>
            </div>
            <div className="pool-card-body">
              <div className="meta-row"><span>Total pot</span><span className="value pot">${p.pot}</span></div>
              <div className="meta-row"><span>Min entry</span><span className="value">$5.00</span></div>
              <div className="meta-row" style={{ borderBottom: "none" }}>
                <span>Participants</span>
                <Avatars seed={p.seed} count={p.parts} />
              </div>
              <span className={`join-btn${p.state === "open" ? "" : " ghost"}`}>
                {p.state === "open" ? "Join pool" : "View pool"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
