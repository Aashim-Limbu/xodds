import Link from "next/link";

export const metadata = { title: "xOdds — The Fine Print" };

/* ponytail: static hackathon-honest legal copy; replace with counsel-reviewed text before any real launch */
export default function Legal() {
  return (
    <div className="container" style={{ maxWidth: 760 }}>
      <p style={{ marginTop: 24 }}>
        <Link href="/">&larr; Back to xOdds</Link>
      </p>
      <h1>The Fine Print</h1>

      <div className="panel" id="terms">
        <h2>Terms &amp; Conditions</h2>
        <p>
          xOdds is a hackathon demo running on Solana devnet. Stakes use test USDC with no real-world
          value. Pools are parimutuel: everyone&apos;s stake goes into a shared pot and winners split it
          pro-rata — there is no house and no house edge. Settlement is performed automatically by a
          TxLINE Score Proof verified on-chain; nobody (including us) can override a result.
        </p>
        <p>Use it, break it, tell us what fell over. No warranties of any kind.</p>
      </div>

      <div className="panel" id="privacy">
        <h2>Privacy Policy</h2>
        <p>
          We store as little as possible: your login email (via Privy), your wallet address, and the
          messages you post to a Group&apos;s Feed. Groups live in your browser&apos;s local storage.
          We don&apos;t sell data, run ads, or track you across the web.
        </p>
      </div>

      <div className="panel" id="responsible">
        <h2>Responsible Gaming</h2>
        <p>
          xOdds is built for small stakes between friends, not for chasing losses. Even with test
          funds: set a limit, keep it social, and step away when it stops being fun. If gambling is a
          problem for you or someone close to you, help is free and confidential at{" "}
          <a href="https://www.begambleaware.org" rel="noopener noreferrer">BeGambleAware.org</a>.
        </p>
      </div>
    </div>
  );
}
