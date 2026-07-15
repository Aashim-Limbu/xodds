/* ponytail: static design-preview with mock data — mirrors the real components' markup/classes
 * so signed-in screens can be eyeballed without Privy auth. Not linked; delete when design settles. */
import { Avatars } from "@/components/Avatars";
import { InviteModal } from "@/components/InviteModal";

const POOLS: Array<{ title: string; sub: string; state: string; pot: string; top: string; parts: number; seed: string; icon: string; sport: number }> = [
  { title: "Argentina vs Brazil", sub: "Match Winner (1X2)", state: "open", pot: "450.00", top: "210.00", parts: 12, seed: "a", icon: "sports_soccer", sport: 0 },
  { title: "France vs England", sub: "Total Goals O/U 2.5", state: "locked", pot: "1,200.00", top: "740.00", parts: 18, seed: "b", icon: "sports_motorsports", sport: 1 },
  { title: "Spain vs Germany", sub: "Match Winner (1X2)", state: "settled", pot: "225.00", top: "160.00", parts: 7, seed: "c", icon: "sports_basketball", sport: 2 },
];
const CHIP: Record<string, string> = { open: "OPEN", locked: "LOCKED", settled: "SETTLED", void: "VOID" };

export default function Preview() {
  return (
    <>
      <nav className="dash-nav">
        <div className="dash-nav-inner">
          <div className="brand"><span>x</span>Odds</div>
          <div className="nav-links">
            <a className="nav-link" href="#" aria-current="page">Pools</a>
            <a className="nav-link" href="#">Syndicate</a>
            <a className="nav-link" href="#">Activity</a>
            <a className="nav-link" href="#">Profile</a>
          </div>
          <div className="nav-right">
            <button className="nav-icon-btn" aria-label="Notifications"><span className="msym">notifications</span></button>
            <button className="nav-icon-btn" aria-label="Account"><span className="msym">account_circle</span></button>
          </div>
        </div>
      </nav>

      <div className="container">
        {/* Group hero */}
        <div className="hero">
          <div className="hero-content">
            <div className="hero-main">
              <span className="chip-id">ID: GRP-8472-X</span>
              <h1 className="hero-title" style={{ marginTop: 12 }}>The Lads</h1>
              <p className="hero-sub">
                Private betting syndicate. Weekend accumulators, F1 podiums, and the occasional wildly
                irresponsible prop bet.
              </p>
              <div className="hero-members">
                <Avatars seed="the-lads" count={12} shown={3} showMore />
                <span className="label">12 MEMBERS</span>
              </div>
            </div>
            <div className="hero-actions">
              <InviteModal url="https://xodds.app/join/the-lads-8472" />
              <button className="hero-btn newpool"><span className="msym">add_circle</span>New Pool</button>
            </div>
          </div>
        </div>

        {/* Active pools */}
        <div className="section-head">
          <h2 className="section-title">Active Pools</h2>
          <div className="filter-seg">
            <button aria-pressed>all</button>
            <button>open</button>
            <button>settled</button>
          </div>
        </div>
        <div className="pool-grid">
          {POOLS.map((p) => {
            const open = p.state === "open";
            return (
              <div key={p.seed} className={`panel pool-card is-${p.state}`}>
                <div className="pc-body">
                  <div className="pc-head">
                    <div className="row" style={{ gap: 12, minWidth: 0 }}>
                      <span className={`pc-icon sport-${p.sport}`} aria-hidden="true">
                        <span className="msym">{p.icon}</span>
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div className="pc-title">{p.title}</div>
                        <div className="pc-sub">{p.sub}</div>
                      </div>
                    </div>
                    <span className={`pc-chip is-${p.state}`}>{CHIP[p.state]}</span>
                  </div>
                  <div className="pc-cells">
                    <div className="pc-cell"><span className="label">Total pot</span><span className="num">${p.pot}</span></div>
                    <div className="pc-cell"><span className="label">Top side</span><span className="num">${p.top}</span></div>
                  </div>
                  <div className="pc-parts">
                    <span className="label">Participants</span>
                    <Avatars seed={p.seed} count={p.parts} />
                  </div>
                </div>
                <span className={`pc-action ${open ? "join" : "view"}`}>{open ? "Join pool" : "View pool"}</span>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
