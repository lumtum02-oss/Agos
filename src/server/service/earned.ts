/**
 * Pure earned amount calculation — no Date.now() inside, caller injects `now`.
 * earned = min(fundedAmount, floor(elapsedSeconds * ratePerSecond))
 * net_earned = earned - withdrawnAmount
 */

/** Convert minor-unit text to BigInt */
export function toMinor(s: string): bigint {
  return BigInt(s);
}

/**
 * Format minor units (6-decimal micro units) to a Stellar-valid decimal string.
 * Works for any asset — internally all amounts use 6-decimal precision, which is
 * a valid Stellar amount (Stellar allows up to 7 decimals) for both XLM and USDC.
 */
export function formatAmount(minor: bigint): string {
  const whole = minor / 1_000_000n;
  const frac = minor % 1_000_000n;
  return `${whole}.${frac.toString().padStart(6, '0').replace(/0+$/, '') || '00'}`;
}

/** @deprecated kept as alias — amounts are asset-agnostic now. */
export const formatUsdc = formatAmount;

export type EarnedResult = {
  earnedMinor: bigint;
  withdrawnMinor: bigint;
  netEarnedMinor: bigint; // claimable right now
  fundedMinor: bigint;
  remainingMinor: bigint; // funded - earned (for cancel refund)
  elapsedSeconds: number;
  percentComplete: number;
};

export function calcEarned(opts: {
  ratePerSecondMinor: string;
  fundedAmountMinor: string;
  withdrawnAmountMinor: string;
  startedAt: Date;
  now: Date;
}): EarnedResult {
  const rate = toMinor(opts.ratePerSecondMinor);
  const funded = toMinor(opts.fundedAmountMinor);
  const withdrawn = toMinor(opts.withdrawnAmountMinor);
  const elapsedMs = opts.now.getTime() - opts.startedAt.getTime();
  const elapsedSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const earnedRaw = rate * BigInt(elapsedSeconds);
  const earned = earnedRaw > funded ? funded : earnedRaw;
  const netEarned = earned > withdrawn ? earned - withdrawn : 0n;
  const remaining = funded > earned ? funded - earned : 0n;
  const percentComplete = funded > 0n ? Number((earned * 100n) / funded) : 0;
  return {
    earnedMinor: earned,
    withdrawnMinor: withdrawn,
    netEarnedMinor: netEarned,
    fundedMinor: funded,
    remainingMinor: remaining,
    elapsedSeconds,
    percentComplete,
  };
}
