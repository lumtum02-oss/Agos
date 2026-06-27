export const dynamic = 'force-dynamic';

import { setRequestLocale } from 'next-intl/server';
import { Waves, Clock, DollarSign, Users, ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { Navbar } from '@/ui/components/layout/Navbar';
import { db } from '@/server/db/client';
import { streams } from '@/server/db/schema';
import { eq } from 'drizzle-orm';

type Props = {
  params: Promise<{ locale: string }>;
};

async function getLiveStreams() {
  try {
    const active = await db
      .select()
      .from(streams)
      .where(eq(streams.status, 'active'))
      .limit(6);
    return active;
  } catch {
    return [];
  }
}

function formatMonthlyRate(rateMinor: string): string {
  const monthly = (BigInt(rateMinor) * 2_592_000n) / 1_000_000n;
  return monthly.toString();
}

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const liveStreams = await getLiveStreams();

  return (
    <>
      <Navbar locale={locale} />
      <main className="pt-16">
        {/* Hero Section - Layout E */}
        <section className="relative overflow-hidden gradient-mesh">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-24 md:py-32">
            <div className="max-w-3xl">
              {/* Eyebrow */}
              <div className="flex items-center gap-2 mb-6">
                <Waves className="w-5 h-5 text-cyan-600" />
                <span className="text-sm font-semibold text-cyan-600 uppercase tracking-wider">
                  Agos — Stellar Payroll Streaming
                </span>
              </div>

              {/* Headline */}
              <h1 className="font-heading text-5xl md:text-7xl font-bold text-foreground leading-tight mb-6">
                Pay contractors{' '}
                <span className="text-cyan-600">per second.</span>
              </h1>

              <p className="text-xl text-muted-foreground mb-8 max-w-xl">
                Agos streams salaries in real time on Stellar — pay in native XLM by default, or
                opt into USDC. Recipients withdraw what they have earned, any second. No batch
                payroll, no waiting for payday.
              </p>

              {/* Illustrative animated preview (not a real account) */}
              <div className="flex items-center gap-3 mb-8 p-4 bg-white dark:bg-card rounded-xl border border-cyan-200 dark:border-cyan-800 inline-flex w-fit">
                <div className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
                <span className="text-xs uppercase tracking-wide text-muted-foreground">Preview</span>
                <span className="font-mono text-lg font-bold text-cyan-600 drip-counter">
                  500.000000
                </span>
                <span className="text-xs text-muted-foreground">XLM/mo, dripping every second</span>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href={`/${locale}/dashboard`}
                  className="flex items-center gap-2 px-6 py-3 rounded-lg bg-cyan-600 text-white hover:bg-cyan-700 transition-colors font-medium"
                >
                  Start Streaming
                  <ArrowUpRight className="w-4 h-4" />
                </Link>
                <Link
                  href={`/${locale}/stats`}
                  className="px-6 py-3 rounded-lg border border-border text-foreground hover:bg-muted transition-colors font-medium"
                >
                  View live stats
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Features row */}
        <section className="border-t border-border bg-muted/30">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-cyan-100 dark:bg-cyan-900 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-cyan-600" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1">Real-time streaming</h3>
                  <p className="text-sm text-muted-foreground">
                    Earnings accumulate every second. Withdraw at any moment.
                  </p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-cyan-100 dark:bg-cyan-900 flex items-center justify-center">
                  <DollarSign className="w-5 h-5 text-cyan-600" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1">XLM by default, USDC optional</h3>
                  <p className="text-sm text-muted-foreground">
                    Native XLM needs no trustline. Switch to USDC in one tap when you want a stablecoin.
                  </p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-cyan-100 dark:bg-cyan-900 flex items-center justify-center">
                  <Users className="w-5 h-5 text-cyan-600" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1">Built for remote teams</h3>
                  <p className="text-sm text-muted-foreground">
                    Pay contractors across Southeast Asia with zero friction.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Live feed section */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-2xl font-heading font-bold mb-1">Live Streams</h2>
              <p className="text-muted-foreground">Active salary streams — dripping right now</p>
            </div>
            {liveStreams.length > 0 && (
              <div className="flex items-center gap-1.5 text-sm text-cyan-600">
                <div className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
                {liveStreams.length} active
              </div>
            )}
          </div>

          {liveStreams.length === 0 ? (
            <div className="text-center py-16 border border-dashed border-border rounded-xl">
              <Waves className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-muted-foreground font-medium">No active streams yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Connect your wallet and open the first salary stream — it will appear here, live.
              </p>
              <Link
                href={`/${locale}/dashboard`}
                className="inline-flex items-center gap-2 mt-4 px-4 py-2 rounded-lg bg-cyan-600 text-white hover:bg-cyan-700 transition-colors text-sm font-medium"
              >
                Go to Dashboard <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {liveStreams.map((stream) => (
                <div
                  key={stream.id}
                  className="rounded-xl border border-border bg-card p-4 card-shadow"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="font-semibold">{stream.employeeName}</p>
                      <p className="text-xs text-muted-foreground">{stream.title}</p>
                    </div>
                    <div className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-xs text-muted-foreground">
                      {formatMonthlyRate(stream.ratePerSecondMinor)} {stream.asset ?? 'XLM'}/mo
                    </span>
                  </div>
                  <Link
                    href={`/${locale}/streams/${stream.id}`}
                    className="mt-3 text-xs text-cyan-600 hover:text-cyan-700 flex items-center gap-1"
                  >
                    View stream <ArrowUpRight className="w-3 h-3" />
                  </Link>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Footer */}
        <footer className="border-t border-border bg-muted/30">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Waves className="w-4 h-4 text-cyan-600" />
              <span>Agos — salary streaming on Stellar testnet</span>
            </div>
            <div className="flex items-center gap-5">
              <Link href={`/${locale}/dashboard`} className="hover:text-foreground">
                Dashboard
              </Link>
              <Link href={`/${locale}/stats`} className="hover:text-foreground">
                Stats
              </Link>
            </div>
          </div>
        </footer>
      </main>
    </>
  );
}
