'use client';

import { Clock, Users, CheckCircle2, XCircle, Play, ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { DripCounter } from './DripCounter';

export type StreamCardData = {
  id: string;
  employeeName: string;
  title: string;
  status: string;
  asset?: string;
  ratePerSecondMinor: string;
  fundedAmountMinor: string;
  withdrawnAmountMinor: string;
  startedAt: string;
};

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
    active: {
      label: 'Active',
      className: 'bg-cyan-50 text-cyan-700 border-cyan-200',
      icon: <Play className="w-3 h-3" />,
    },
    cancelled: {
      label: 'Cancelled',
      className: 'bg-red-50 text-red-700 border-red-200',
      icon: <XCircle className="w-3 h-3" />,
    },
    completed: {
      label: 'Completed',
      className: 'bg-green-50 text-green-700 border-green-200',
      icon: <CheckCircle2 className="w-3 h-3" />,
    },
    paused: {
      label: 'Paused',
      className: 'bg-yellow-50 text-yellow-700 border-yellow-200',
      icon: <Clock className="w-3 h-3" />,
    },
  };
  const { label, className, icon } = map[status] ?? map.active;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${className}`}
    >
      {icon}
      {label}
    </span>
  );
}

function formatUsdcDisplay(minor: string): string {
  const n = BigInt(minor);
  const whole = n / 1_000_000n;
  const frac = n % 1_000_000n;
  return `${whole}.${frac.toString().padStart(6, '0').slice(0, 2)}`;
}

function rateToMonthly(ratePerSecondMinor: string): string {
  const monthly = (BigInt(ratePerSecondMinor) * 2_592_000n) / 1_000_000n;
  return monthly.toString();
}

export function StreamCard({ stream, locale }: { stream: StreamCardData; locale: string }) {
  const monthly = rateToMonthly(stream.ratePerSecondMinor);
  const asset = stream.asset ?? 'XLM';

  return (
    <div className="rounded-xl border border-border bg-card card-shadow p-5 flex flex-col gap-4 hover:border-cyan-300 transition-colors">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-4 h-4 text-muted-foreground" />
            <span className="font-semibold text-foreground">{stream.employeeName}</span>
          </div>
          <p className="text-sm text-muted-foreground">{stream.title}</p>
        </div>
        <StatusBadge status={stream.status} />
      </div>

      {stream.status === 'active' && (
        <div className="bg-cyan-50 dark:bg-cyan-950 rounded-lg p-3">
          <p className="text-xs text-muted-foreground mb-1">Claimable now</p>
          <DripCounter
            ratePerSecondMinor={stream.ratePerSecondMinor}
            fundedAmountMinor={stream.fundedAmountMinor}
            withdrawnAmountMinor={stream.withdrawnAmountMinor}
            startedAt={stream.startedAt}
            asset={asset}
          />
        </div>
      )}

      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Monthly</p>
            <p className="font-medium">{monthly} {asset}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Funded</p>
            <p className="font-medium">{formatUsdcDisplay(stream.fundedAmountMinor)} {asset}</p>
          </div>
        </div>
        <Link
          href={`/${locale}/streams/${stream.id}`}
          className="flex items-center gap-1 text-cyan-600 hover:text-cyan-700 font-medium text-sm"
        >
          View <ArrowUpRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
}
