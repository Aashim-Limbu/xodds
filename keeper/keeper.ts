import { type Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import type { Finalwhistle } from "../target/types/finalwhistle.js";
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
  ) {}

  get signer(): PublicKey {
    return this.program.provider.publicKey!;
  }

  /** One pass over every Pool. Returns the actions taken (for logging/tests). */
  async tick(): Promise<Array<{ pool: string; action: KeeperAction }>> {
    const pools = await this.program.account.pool.all();
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
      const { proof } = buildScoreProof(stats, this.txline.siblings(fixtureId));
      await this.program.methods.settle(proof).accountsPartial({ pool, scoresRoot, signer }).rpc();
    }
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
