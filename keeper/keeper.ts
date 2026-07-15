import { BN, utils, type Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import type { Finalwhistle } from "./idl/finalwhistle.js";
import type { TxlineMock } from "./idl/txline_mock.js";
import { decideAction, type KeeperAction, type PoolState } from "./decide.js";
import { buildScoreProof } from "./merkle.js";
import type { TxLineClient } from "./txline.js";

function log(msg: string) {
  console.log(`[keeper] ${msg}`);
}

/**
 * The Keeper: a stateless poller that drives Pools to their terminal state so settlement
 * feels automatic. Each tick it re-reads every Pool from chain and takes the one
 * permissionless action the pure `decideAction` core dictates — so it is safe to restart
 * (it re-derives all work) and never double-submits (terminal Pools are skipped, and the
 * on-chain guards reject any race it loses). It holds no special authority (ADR-0004).
 */
export class Keeper {
  constructor(
    private readonly program: Program<Finalwhistle>,
    private readonly txline: TxLineClient,
    private readonly now: () => number = () => Math.floor(Date.now() / 1000),
    /** The txline_mock scores publisher. When present the Keeper self-publishes a missing
     * score root before settling (ADR-0008 re-anchoring) — no manual publish-roots step. */
    private readonly mock?: Program<TxlineMock>,
  ) {}

  get signer(): PublicKey {
    return this.program.provider.publicKey!;
  }

  /** All decodable Pools. Decodes per-account (unlike `.all()`, which throws wholesale) so
   * relic accounts from before a program upgrade can't kill the whole tick — they're skipped. */
  private async fetchPools() {
    const discriminator = Buffer.from(
      (this.program.idl.accounts!.find((a) => a.name === "pool")!).discriminator,
    );
    const raw = await this.program.provider.connection.getProgramAccounts(this.program.programId, {
      filters: [{ memcmp: { offset: 0, bytes: utils.bytes.bs58.encode(discriminator) } }],
    });
    const pools = [];
    for (const { pubkey, account } of raw) {
      try {
        pools.push({ publicKey: pubkey, account: this.program.coder.accounts.decode("pool", account.data) });
      } catch {
        log(`skip undecodable pool ${pubkey.toBase58()} (pre-upgrade layout)`);
      }
    }
    return pools;
  }

  /** One pass over every Pool. Returns the actions taken (for logging/tests). */
  async tick(): Promise<Array<{ pool: string; action: KeeperAction }>> {
    const pools = await this.fetchPools();
    // Warm any network-backed TxLINE cache (RealTxLine) so result()/stats() read synchronously.
    await this.txline.refresh?.(pools.map((p) => BigInt(p.account.fixtureId.toString())));
    const now = this.now();
    const taken: Array<{ pool: string; action: KeeperAction }> = [];

    for (const { publicKey, account } of pools) {
      const state = Object.keys(account.state)[0] as PoolState;
      const fixtureId = BigInt(account.fixtureId.toString());
      // Settle only when the score root actually exists; otherwise the grace fallback Voids.
      const settleable = this.txline.scoresRootAccount(fixtureId) !== null;
      const action = decideAction(state, account.kickoffTs.toNumber(), now, this.txline.result(fixtureId), settleable);
      if (action === "none") continue;
      try {
        await this.execute(action, publicKey, fixtureId);
        taken.push({ pool: publicKey.toBase58(), action });
        log(`${action} ${publicKey.toBase58()} (fixture ${fixtureId})`);
      } catch (e) {
        // A lost race (someone else already acted) or a missing TxLINE root lands here —
        // the on-chain guards keep it safe; log and move on.
        log(`skip ${action} ${publicKey.toBase58()}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return taken;
  }

  private async execute(action: KeeperAction, pool: PublicKey, fixtureId: bigint): Promise<void> {
    const signer = this.signer;
    if (action === "lock") {
      await this.program.methods.lock().accountsPartial({ pool, signer }).rpc();
      return;
    }
    if (action === "void_expired") {
      await this.program.methods.voidExpired().accountsPartial({ pool, signer }).rpc();
      return;
    }
    if (action === "settle") {
      const stats = this.txline.stats(fixtureId);
      const scoresRoot = this.txline.scoresRootAccount(fixtureId);
      if (!stats || !scoresRoot) {
        throw new Error("no TxLINE score root available (integration boundary)");
      }
      const { root, proof } = buildScoreProof(stats, this.txline.siblings(fixtureId));
      await this.ensureRootPublished(fixtureId, scoresRoot, root);
      await this.program.methods.settle(proof).accountsPartial({ pool, scoresRoot, signer }).rpc();
    }
  }

  /** Publish the score root if its PDA doesn't exist yet — or holds DIFFERENT bytes (a
   * stale root from an earlier slate would otherwise reject every proof forever). No-op
   * without the mock program (tests) or when the on-chain root already matches. */
  private async ensureRootPublished(fixtureId: bigint, scoresRoot: PublicKey, root: Uint8Array): Promise<void> {
    if (!this.mock) return;
    const existing = await this.program.provider.connection.getAccountInfo(scoresRoot);
    // ScoresRoot layout: 8-byte discriminator then the [u8;32] root (bytes [8..40]).
    if (existing && Buffer.from(existing.data.subarray(8, 40)).equals(Buffer.from(root))) return;
    await this.mock.methods
      .publishRoot(new BN(fixtureId.toString()), Array.from(root))
      .accountsPartial({ scoresRoot, publisher: this.signer, systemProgram: SystemProgram.programId })
      .rpc();
    log(`published score root for fixture ${fixtureId} -> ${scoresRoot.toBase58()}`);
  }

  /**
   * Run tick() forever, self-scheduling so a slow tick never overlaps the next, and
   * catching tick-level failures (e.g. a transient RPC error fetching Pools) so the
   * Keeper keeps running instead of crashing on an unhandled rejection.
   */
  runLoop(intervalMs: number): void {
    log(`watching Pools every ${intervalMs}ms as ${this.signer.toBase58()}`);
    const loop = async () => {
      try {
        await this.tick();
      } catch (e) {
        log(`tick failed: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setTimeout(loop, intervalMs);
      }
    };
    void loop();
  }
}
