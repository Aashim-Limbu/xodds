import { Clock, type ProgramTestContext } from "solana-bankrun";

/**
 * Set the SVM's on-chain unix timestamp (seconds), preserving slot/epoch.
 * Later tickets use this to reach Fixture kickoff (Lock) and the Void grace deadline.
 */
export async function setUnixTimestamp(
  context: ProgramTestContext,
  unixTimestamp: number,
): Promise<void> {
  const clock = await context.banksClient.getClock();
  context.setClock(
    new Clock(
      clock.slot,
      clock.epochStartTimestamp,
      clock.epoch,
      clock.leaderScheduleEpoch,
      BigInt(unixTimestamp),
    ),
  );
}

/** Read the SVM's current on-chain unix timestamp (seconds). */
export async function currentUnixTimestamp(context: ProgramTestContext): Promise<number> {
  const clock = await context.banksClient.getClock();
  return Number(clock.unixTimestamp);
}
