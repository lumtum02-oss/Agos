import { describe, it, expect } from 'vitest';
import { calcEarned, formatUsdc, toMinor } from '@/server/service/earned';

const startedAt = new Date('2026-06-01T00:00:00.000Z');

describe('calcEarned', () => {
  it('returns zero net earned at t=0', () => {
    const result = calcEarned({
      ratePerSecondMinor: '119',
      fundedAmountMinor: '1000000000',
      withdrawnAmountMinor: '0',
      startedAt,
      now: startedAt,
    });
    expect(result.netEarnedMinor).toBe(0n);
    expect(result.earnedMinor).toBe(0n);
    expect(result.elapsedSeconds).toBe(0);
  });

  it('earns correctly at 1 second', () => {
    const now = new Date(startedAt.getTime() + 1000);
    const result = calcEarned({
      ratePerSecondMinor: '119',
      fundedAmountMinor: '1000000000',
      withdrawnAmountMinor: '0',
      startedAt,
      now,
    });
    expect(result.earnedMinor).toBe(119n);
    expect(result.netEarnedMinor).toBe(119n);
    expect(result.elapsedSeconds).toBe(1);
  });

  it('earns correctly at 1 hour', () => {
    const now = new Date(startedAt.getTime() + 3600 * 1000);
    const result = calcEarned({
      ratePerSecondMinor: '119',
      fundedAmountMinor: '1000000000000',
      withdrawnAmountMinor: '0',
      startedAt,
      now,
    });
    expect(result.earnedMinor).toBe(119n * 3600n);
    expect(result.elapsedSeconds).toBe(3600);
  });

  it('caps earned at funded amount', () => {
    // funded = 1000 minor, rate 1000/sec, after 10 sec = 10000 min, but capped at 1000
    const now = new Date(startedAt.getTime() + 10_000);
    const result = calcEarned({
      ratePerSecondMinor: '1000',
      fundedAmountMinor: '1000',
      withdrawnAmountMinor: '0',
      startedAt,
      now,
    });
    expect(result.earnedMinor).toBe(1000n);
    expect(result.netEarnedMinor).toBe(1000n);
  });

  it('subtracts withdrawn amount from net earned', () => {
    const now = new Date(startedAt.getTime() + 100_000);
    const result = calcEarned({
      ratePerSecondMinor: '1000',
      fundedAmountMinor: '1000000000',
      withdrawnAmountMinor: '50000',
      startedAt,
      now,
    });
    expect(result.withdrawnMinor).toBe(50000n);
    expect(result.netEarnedMinor).toBe(result.earnedMinor - 50000n);
  });

  it('handles zero rate', () => {
    const now = new Date(startedAt.getTime() + 10_000);
    const result = calcEarned({
      ratePerSecondMinor: '0',
      fundedAmountMinor: '1000000',
      withdrawnAmountMinor: '0',
      startedAt,
      now,
    });
    expect(result.earnedMinor).toBe(0n);
    expect(result.netEarnedMinor).toBe(0n);
  });

  it('never returns negative netEarned when withdrawn > earned', () => {
    // Edge case: withdrawn somehow exceeds current earned
    const now = new Date(startedAt.getTime() + 1000);
    const result = calcEarned({
      ratePerSecondMinor: '100',
      fundedAmountMinor: '1000000',
      withdrawnAmountMinor: '500', // more than 1 second of earning
      startedAt,
      now,
    });
    // earned = 100, withdrawn = 500: net should be 0 not negative
    expect(result.netEarnedMinor).toBe(0n);
    expect(result.netEarnedMinor).toBeGreaterThanOrEqual(0n);
  });

  it('handles large amounts (IDR equivalent in USDC)', () => {
    // Rp 10,000,000/month @ IDR 15,500/USD = ~$645/mo = ~$0.000249/sec
    const rate = '249';
    const funded = String(645n * 1_000_000n); // 645 USDC
    const now = new Date(startedAt.getTime() + 30 * 24 * 3600 * 1000); // 1 month
    const result = calcEarned({
      ratePerSecondMinor: rate,
      fundedAmountMinor: funded,
      withdrawnAmountMinor: '0',
      startedAt,
      now,
    });
    // Earned should be capped at funded
    expect(result.earnedMinor).toBe(BigInt(funded));
    expect(result.percentComplete).toBe(100);
  });

  it('calculates percentComplete correctly at half-funded', () => {
    // Rate = 1000/sec, funded = 1000000
    // After 500 seconds, earned = 500000 (exactly 50%)
    const now = new Date(startedAt.getTime() + 500_000);
    const result = calcEarned({
      ratePerSecondMinor: '1000',
      fundedAmountMinor: '1000000',
      withdrawnAmountMinor: '0',
      startedAt,
      now,
    });
    expect(result.earnedMinor).toBe(500_000n);
    expect(result.percentComplete).toBe(50);
  });

  it('percentComplete is 100 when fully earned', () => {
    const now = new Date(startedAt.getTime() + 10_000);
    const result = calcEarned({
      ratePerSecondMinor: '1000',
      fundedAmountMinor: '1000', // tiny funded, will be capped immediately
      withdrawnAmountMinor: '0',
      startedAt,
      now,
    });
    expect(result.percentComplete).toBe(100);
  });

  it('remainingMinor decreases as time passes', () => {
    const now1 = new Date(startedAt.getTime() + 1000);
    const now2 = new Date(startedAt.getTime() + 2000);
    const opts = {
      ratePerSecondMinor: '1000',
      fundedAmountMinor: '1000000',
      withdrawnAmountMinor: '0',
      startedAt,
    };
    const r1 = calcEarned({ ...opts, now: now1 });
    const r2 = calcEarned({ ...opts, now: now2 });
    expect(r2.remainingMinor).toBeLessThan(r1.remainingMinor);
  });
});

describe('formatUsdc', () => {
  it('formats 1 USDC (1000000 minor) correctly', () => {
    expect(formatUsdc(1_000_000n)).toBe('1.00');
  });

  it('formats fractional USDC', () => {
    expect(formatUsdc(119n)).toBe('0.000119');
  });

  it('formats zero', () => {
    expect(formatUsdc(0n)).toBe('0.00');
  });
});
