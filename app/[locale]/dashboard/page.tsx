'use client';

import { useEffect, useState } from 'react';
import { Waves, DollarSign, Users, ArrowUpRight, Plus } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Navbar } from '@/ui/components/layout/Navbar';
import { StreamCard } from '@/ui/components/StreamCard';
import { EnableUsdcButton } from '@/ui/components/EnableUsdcButton';
import { useWallet } from '@/ui/hooks/useWallet';
import type { StreamCardData } from '@/ui/components/StreamCard';

type Stats = {
  totalStreams: number;
  activeStreams: number;
  totalPaidOutMinor: string;
};

function formatUsdc(minor: string): string {
  const n = BigInt(minor);
  const whole = n / 1_000_000n;
  const frac = n % 1_000_000n;
  return `${whole}.${frac.toString().padStart(6, '0').slice(0, 2)}`;
}

export default function DashboardPage() {
  const params = useParams();
  const locale = (params?.locale as string) ?? 'en';
  const { publicKey, isConnected, connect } = useWallet();
  const [streams, setStreams] = useState<StreamCardData[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isConnected) return;
    setLoading(true);
    fetch('/api/streams')
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) {
          setStreams(
            data.data.streams.map((s: StreamCardData & { startedAt: string }) => ({
              ...s,
              startedAt: s.startedAt,
            })),
          );
          setStats(data.data.stats);
        }
      })
      .finally(() => setLoading(false));
  }, [isConnected]);

  return (
    <>
      <Navbar locale={locale} />
      <main className="pt-16 min-h-screen">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-heading font-bold">Dashboard</h1>
              <p className="text-muted-foreground mt-1">Manage your salary streams</p>
            </div>
            {isConnected && publicKey && (
              <div className="flex items-center gap-3">
                <EnableUsdcButton publicKey={publicKey} />
                <Link
                  href={`/${locale}/streams/new`}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-600 text-white hover:bg-cyan-700 transition-colors font-medium text-sm"
                >
                  <Plus className="w-4 h-4" />
                  New Stream
                </Link>
              </div>
            )}
          </div>

          {!isConnected ? (
            <div className="text-center py-20 border border-dashed border-border rounded-xl">
              <Waves className="w-12 h-12 text-cyan-500/40 mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">Connect your wallet</h2>
              <p className="text-muted-foreground mb-6">
                Connect Freighter to view and manage your salary streams.
              </p>
              <button
                onClick={connect}
                className="px-6 py-2.5 rounded-lg bg-cyan-600 text-white hover:bg-cyan-700 transition-colors font-medium"
              >
                Connect Wallet
              </button>
            </div>
          ) : (
            <>
              {/* Stats */}
              {stats && (
                <div className="grid grid-cols-3 gap-4 mb-8" data-testid="stats-cards">
                  <div className="rounded-xl border border-border bg-card p-5 card-shadow">
                    <div className="flex items-center gap-2 mb-2">
                      <Waves className="w-4 h-4 text-cyan-600" />
                      <p className="text-sm text-muted-foreground">Total Streams</p>
                    </div>
                    <p className="text-3xl font-bold">{stats.totalStreams}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-5 card-shadow">
                    <div className="flex items-center gap-2 mb-2">
                      <Users className="w-4 h-4 text-cyan-600" />
                      <p className="text-sm text-muted-foreground">Active Streams</p>
                    </div>
                    <p className="text-3xl font-bold text-cyan-600">{stats.activeStreams}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-5 card-shadow">
                    <div className="flex items-center gap-2 mb-2">
                      <DollarSign className="w-4 h-4 text-cyan-600" />
                      <p className="text-sm text-muted-foreground">Total Paid Out</p>
                    </div>
                    <p className="text-3xl font-bold">{formatUsdc(stats.totalPaidOutMinor)}</p>
                    <p className="text-xs text-muted-foreground mt-1">across all streams</p>
                  </div>
                </div>
              )}

              {/* Stream list */}
              {loading ? (
                <div className="text-center py-12 text-muted-foreground">Loading streams…</div>
              ) : streams.length === 0 ? (
                <div className="text-center py-16 border border-dashed border-border rounded-xl">
                  <Waves className="w-10 h-10 text-muted-foreground/30 mx-auto mb-4" />
                  <p className="font-medium mb-1">No streams yet</p>
                  <p className="text-sm text-muted-foreground mb-4">
                    Create your first salary stream to start paying contractors per-second.
                  </p>
                  <Link
                    href={`/${locale}/streams/new`}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-600 text-white hover:bg-cyan-700 transition-colors text-sm font-medium"
                  >
                    <Plus className="w-4 h-4" /> Create First Stream
                  </Link>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {streams.map((stream) => (
                    <StreamCard key={stream.id} stream={stream} locale={locale} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </>
  );
}
