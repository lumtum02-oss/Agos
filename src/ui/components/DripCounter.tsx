'use client';

import { useEffect, useState, useRef } from 'react';
import { Waves } from 'lucide-react';

type Props = {
  ratePerSecondMinor: string;
  fundedAmountMinor: string;
  withdrawnAmountMinor: string;
  startedAt: string; // ISO string
  asset?: string;
  className?: string;
  large?: boolean;
};

function formatMinor(minor: bigint): string {
  const whole = minor / 1_000_000n;
  const frac = minor % 1_000_000n;
  return `${whole}.${frac.toString().padStart(6, '0')}`;
}

export function DripCounter({
  ratePerSecondMinor,
  fundedAmountMinor,
  withdrawnAmountMinor,
  startedAt,
  asset = 'XLM',
  className = '',
  large = false,
}: Props) {
  const [earnedMinor, setEarnedMinor] = useState<bigint>(0n);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const rate = BigInt(ratePerSecondMinor);
    const funded = BigInt(fundedAmountMinor);
    const withdrawn = BigInt(withdrawnAmountMinor);
    const startMs = new Date(startedAt).getTime();

    function tick() {
      const elapsedMs = Date.now() - startMs;
      const elapsedSec = Math.max(0, Math.floor(elapsedMs / 1000));
      const raw = rate * BigInt(elapsedSec);
      const earned = raw > funded ? funded : raw;
      const net = earned > withdrawn ? earned - withdrawn : 0n;
      setEarnedMinor(net);
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [ratePerSecondMinor, fundedAmountMinor, withdrawnAmountMinor, startedAt]);

  const display = formatMinor(earnedMinor);
  const [whole, frac] = display.split('.');

  return (
    <div className={`flex items-baseline gap-1 drip-counter ${className}`}>
      <span className={large ? 'text-5xl font-bold text-cyan-600' : 'text-2xl font-bold text-cyan-600'}>
        {whole}
      </span>
      <span className={large ? 'text-2xl text-cyan-500' : 'text-lg text-cyan-500'}>
        .{frac} <span className="text-xs text-muted-foreground font-normal ml-0.5">{asset}</span>
      </span>
    </div>
  );
}
