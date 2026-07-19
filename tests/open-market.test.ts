import { describe, expect, it, vi } from "vitest";
import { PublicKey } from "@solana/web3.js";
import { findOrOpenPool } from "../app/lib/openMarket.js";

const G = new PublicKey("11111111111111111111111111111111");
const EXISTING = PublicKey.unique();
const fixture = { fixtureId: 1002n, home: "France", away: "England", kickoff: 1784408400, referenceProbabilities: [0, 0, 0] } as never;

function poolRow(over: Record<string, unknown> = {}) {
  return { address: EXISTING, group: G, fixtureId: 1002n, poolType: "totalGoals", lineX2: 5, ...over } as never;
}

function deps(over: Record<string, unknown> = {}) {
  return {
    client: {
      listPools: vi.fn().mockResolvedValue([]),
      freeNonce: vi.fn().mockResolvedValue(0n),
      createPool: vi.fn().mockResolvedValue(PublicKey.unique()),
    },
    group: G,
    fixture,
    poolType: "totalGoals",
    lineX2: 5,
    kickoffTs: 1784408400,
    getAccessToken: vi.fn().mockResolvedValue(null),
    ...over,
  } as never;
}

describe("findOrOpenPool", () => {
  it("joins an existing Pool on the same market and line instead of creating one", async () => {
    const d = deps({
      client: {
        listPools: vi.fn().mockResolvedValue([poolRow()]),
        freeNonce: vi.fn(),
        createPool: vi.fn(),
      },
    });
    const out = await findOrOpenPool(d);
    expect(out).toEqual({ pool: EXISTING, created: false });
    expect(d.client.createPool).not.toHaveBeenCalled();
  });

  it("does not join a Pool at a different line", async () => {
    const d = deps({
      client: {
        listPools: vi.fn().mockResolvedValue([poolRow({ lineX2: 7 })]),
        freeNonce: vi.fn().mockResolvedValue(0n),
        createPool: vi.fn().mockResolvedValue(PublicKey.unique()),
      },
    });
    const out = await findOrOpenPool(d);
    expect(out.created).toBe(true);
  });

  it("creates the Pool when the market is unopened", async () => {
    const d = deps();
    const out = await findOrOpenPool(d);
    expect(out.created).toBe(true);
    expect(d.client.createPool).toHaveBeenCalledWith(G, 1002n, 0n, 1784408400, "totalGoals", 5);
  });

  // THE RACE. Someone else won the nonce between our scan and our create.
  it("re-scans and JOINS rather than creating a duplicate when create loses the race", async () => {
    const listPools = vi
      .fn()
      .mockResolvedValueOnce([])            // our first scan: nothing there
      .mockResolvedValueOnce([poolRow()]);  // after the failure: the winner's Pool exists
    const d = deps({
      client: {
        listPools,
        freeNonce: vi.fn().mockResolvedValue(0n),
        createPool: vi.fn().mockRejectedValue(new Error("Allocate: account Address { .. } already in use")),
      },
    });
    const out = await findOrOpenPool(d);
    expect(out).toEqual({ pool: EXISTING, created: false });
    expect(d.client.createPool).toHaveBeenCalledTimes(1); // never retried into a duplicate
  });

  it("rethrows a create failure that is not the race", async () => {
    const d = deps({
      client: {
        listPools: vi.fn().mockResolvedValue([]),
        freeNonce: vi.fn().mockResolvedValue(0n),
        createPool: vi.fn().mockRejectedValue(new Error("insufficient funds for rent")),
      },
    });
    await expect(findOrOpenPool(d)).rejects.toThrow("insufficient funds");
  });
});
