/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The app is a standalone package inside the Anchor workspace; pin the trace root to
  // this dir so Next doesn't infer the monorepo root from the parent lockfile.
  outputFileTracingRoot: import.meta.dirname,
  // Silence optional-dep warnings pulled in transitively by web3/anchor and Privy.
  webpack: (config) => {
    config.externals.push("pino-pretty", "lokijs", "encoding");
    // Optional Privy peers for features this app doesn't use (Stripe fiat on-ramp,
    // Farcaster mini-app). pnpm doesn't install optional peers, so webpack can't resolve
    // the lazy imports. Drop these aliases if either feature is ever switched on.
    config.resolve.alias = {
      ...config.resolve.alias,
      "@stripe/crypto": false,
      "@farcaster/mini-app-solana": false,
    };
    // ox (via viem, via Privy's EVM stack) resolves chain configs through a computed
    // require(), which webpack can't trace statically. Nothing is missing — the module
    // is there — so the warning is noise on an EVM path this app never takes.
    config.ignoreWarnings = [
      ...(config.ignoreWarnings ?? []),
      { module: /node_modules\/ox\//, message: /the request of a dependency is an expression/ },
    ];
    return config;
  },
};

export default nextConfig;
