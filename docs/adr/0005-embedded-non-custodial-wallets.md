# Users onboard with embedded, non-custodial wallets — no external wallet

Users sign in with email or social, and a non-custodial wallet is created and app-managed behind the scenes (Privy / Turnkey / Dynamic-style). We deliberately do NOT use the Solana-default "connect Phantom" flow. The app targets a mainstream "friends" audience where crypto must be invisible (the Consumer & Fan Experiences track thesis), and the hackathon rules require judges to test with no third-party wallet — both point away from external wallets. Non-custodial keeps keys with the User so the app never custodies funds, which matters for the real-money framing.

Trade-off accepted: this adds an embedded-wallet SDK as a dependency and some provider lock-in, and it is less familiar to crypto-native users. Worth it for the consumer UX. A reader should not "add wallet-connect to support Phantom users" without revisiting the consumer-invisibility goal.
