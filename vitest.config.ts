import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Silence bankrun's inherited solana_runtime DEBUG log spam.
    env: { RUST_LOG: "off" },
    // bankrun loads a native addon and each suite spins its own in-process SVM;
    // run files in separate forked processes to keep those SVMs isolated.
    pool: "forks",
    testTimeout: 30_000,
    hookTimeout: 30_000,
    include: ["tests/**/*.test.ts"],
  },
});
