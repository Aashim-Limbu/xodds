"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { CLUSTER } from "@/lib/config";

/**
 * Deposit panel for the Privy embedded wallet.
 *
 * Off mainnet this is the whole flow: same token, same chain, so the deposit address IS
 * the user's wallet — no bridge, no route to fail. Privy's `addFunds` covers the harder
 * case (arriving with some other asset on some other chain) and takes over at mainnet.
 */
export function DepositModal({
  wallet,
  usdc,
  onClose,
}: {
  wallet: string;
  /** Current USDC balance; when it moves, the deposit landed. */
  usdc: string | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [opening] = useState(usdc);
  const arrived = usdc !== null && opening !== null && usdc !== opening;

  // Esc to dismiss — expected of anything modal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function copy() {
    await navigator.clipboard.writeText(wallet);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div
        className="modal deposit-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="deposit-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="deposit-title" className="deposit-title">Deposit USDC</h2>

        <div className="qr-frame">
          <QRCodeSVG value={wallet} size={168} level="M" marginSize={2} />
        </div>

        <p className="deposit-hint">
          Scan with any Solana wallet, or send{" "}
          {CLUSTER === "mainnet-beta" ? "USDC" : `${CLUSTER} USDC`} to the address below.
        </p>

        <button
          className={`addr-btn${copied ? " copied" : ""}`}
          onClick={copy}
          title={wallet}
          aria-label={copied ? "Address copied" : `Copy deposit address ${wallet}`}
        >
          <code>{wallet.slice(0, 6)}…{wallet.slice(-6)}</code>
          <span className="addr-action" aria-hidden="true">{copied ? "✓ Copied" : "Copy"}</span>
        </button>

        {/* Balance is already polled by the Profile; this just reads the result. */}
        <p className={`deposit-status${arrived ? " arrived" : ""}`} role="status">
          {arrived ? `Funds landed — balance is now $${usdc}.` : "Waiting for funds…"}
        </p>

        <button className="secondary" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}
