"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { PRIVY_APP_ID, RPC_URL } from "@/lib/config";

// Embedded, non-custodial wallets via Privy (ADR-0005): email/social sign-in creates a
// Solana wallet automatically — no seed phrase, no Phantom connect. Configure the App ID
// and enable Email + Solana embedded wallets in the Privy dashboard.
export function Providers({ children }: { children: React.ReactNode }) {
  if (!PRIVY_APP_ID) {
    return (
      <div style={{ padding: 24, fontFamily: "system-ui", maxWidth: 640, margin: "40px auto" }}>
        <h1>FinalWhistle</h1>
        <p>
          Set <code>NEXT_PUBLIC_PRIVY_APP_ID</code> in <code>.env.local</code> (see{" "}
          <code>.env.example</code>) to enable sign-in. Create an app at{" "}
          <a href="https://dashboard.privy.io">dashboard.privy.io</a> with Email + Solana embedded
          wallets enabled.
        </p>
      </div>
    );
  }
  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ["email", "google"],
        appearance: { theme: "dark", walletChainType: "solana-only" },
        // Solana embedded wallet auto-creation lives under embeddedWallets.solana
        // (the top-level createOnLogin is for Ethereum).
        embeddedWallets: {
          showWalletUIs: false,
          solana: { createOnLogin: "users-without-wallets" },
        },
        solanaClusters: [{ name: "devnet", rpcUrl: RPC_URL }],
      }}
    >
      {children}
    </PrivyProvider>
  );
}
