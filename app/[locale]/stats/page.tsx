export const dynamic = 'force-dynamic';

import { Activity, ArrowUpRight, Coins, Users, Wallet, Waves } from 'lucide-react';
import Link from 'next/link';
import { setRequestLocale } from 'next-intl/server';
import { Navbar } from '@/ui/components/layout/Navbar';
import { statsService } from '@/server/service/stats.service';

type Props = { params: Promise<{ locale: string }> };

function formatMinor(minor: string): string {
  const n = BigInt(minor || '0');
  const whole = n / 1_000_000n;
  const frac = n % 1_000_000n;
  // Show up to 6 decimals, trimming trailing zeros but keeping at least 2.
  const fracStr = frac.toString().padStart(6, '0').replace(/0+$/, '').padEnd(2, '0');
  return `${whole.toLocaleString()}.${fracStr}`;
}

async function load() {
  try {
    return await statsService.getPublicStats();
  } catch {
    return {
      uniqueWallets: 0,
      logins: 0,
      totalStreams: 0,
      activeStreams: 0,
      withdrawals: 0,
      totalStreamedMinor: '0',
      byAsset: { XLM: 0, USDC: 0 },
    };
  }
}

export default async function StatsPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const s = await load();

  const cards = [
    { label: 'Wallets connected', value: s.uniqueWallets.toLocaleString(), icon: Wallet, hint: 'unique SEP-10 sign-ins' },
    { label: 'Sessions', value: s.logins.toLocaleString(), icon: Users, hint: 'total authenticated logins' },
    { label: 'Streams created', value: s.totalStreams.toLocaleString(), icon: Waves, hint: `${s.activeStreams} active now` },
    { label: 'On-chain withdrawals', value: s.withdrawals.toLocaleString(), icon: Activity, hint: 'confirmed Stellar payouts' },
  ];

  return (
    <>
      <Navbar locale={locale} />
      <main className="pt-16 min-h-screen">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-14">
          <div className="mb-10">
            <div className="flex items-center gap-2 mb-3">
              <Activity className="w-5 h-5 text-cyan-600" />
              <span className="text-sm font-semibold uppercase tracking-wider text-cyan-600">
                Live network activity
              </span>
            </div>
            <h1 className="text-4xl font-heading font-bold">Agos in numbers</h1>
            <p className="text-muted-foreground mt-2 max-w-xl">
              Real interaction counts from the Agos testnet deployment. Demo and seed records are
              excluded — every number below comes from a real wallet and a real on-chain action.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
            {cards.map((c) => (
              <div key={c.label} className="rounded-2xl border border-border bg-card p-6 card-shadow">
                <div className="flex items-center gap-2 mb-3 text-muted-foreground">
                  <c.icon className="w-4 h-4 text-cyan-600" />
                  <p className="text-sm">{c.label}</p>
                </div>
                <p className="text-4xl font-bold tabular-nums">{c.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{c.hint}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-border bg-card p-6 card-shadow">
              <div className="flex items-center gap-2 mb-3 text-muted-foreground">
                <Coins className="w-4 h-4 text-cyan-600" />
                <p className="text-sm">Total value streamed</p>
              </div>
              <p className="text-4xl font-bold tabular-nums">{formatMinor(s.totalStreamedMinor)}</p>
              <p className="text-xs text-muted-foreground mt-1">withdrawn across all streams</p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-6 card-shadow">
              <p className="text-sm text-muted-foreground mb-4">Streams by asset</p>
              <div className="space-y-3">
                <AssetBar label="XLM" count={s.byAsset.XLM} total={s.totalStreams} />
                <AssetBar label="USDC" count={s.byAsset.USDC} total={s.totalStreams} />
              </div>
            </div>
          </div>

          <div className="mt-10">
            <Link
              href={`/${locale}/dashboard`}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-cyan-600 text-white hover:bg-cyan-700 transition-colors font-medium"
            >
              Open dashboard <ArrowUpRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}

function AssetBar({ label, count, total }: { label: string; count: number; total: number }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground tabular-nums">{count}</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full bg-cyan-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
