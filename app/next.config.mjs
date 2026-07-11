/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The app is a standalone package inside the Anchor workspace; pin the trace root to
  // this dir so Next doesn't infer the monorepo root from the parent lockfile.
  outputFileTracingRoot: import.meta.dirname,
  // Silence optional-native-dep warnings pulled in transitively by web3/anchor.
  webpack: (config) => {
    config.externals.push("pino-pretty", "lokijs", "encoding");
    return config;
  },
};

export default nextConfig;
