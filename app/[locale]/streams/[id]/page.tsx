'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  Waves,
  Clock,
  DollarSign,
  CheckCircle2,
  XCircle,
  ArrowUpRight,
  Play,
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Navbar } from '@/ui/components/layout/Navbar';
import { DripCounter } from '@/ui/components/DripCounter';
import { EnableUsdcButton } from '@/ui/components/EnableUsdcButton';
import { useWallet } from '@/ui/hooks/useWallet';
import { useStreamSSE } from '@/ui/hooks/useStreamSSE';
import { txExplorerUrl, contractExplorerUrl } from '@/ui/lib/network';

type StreamData = {
  id: string;
  employerPubkey: string;
  employeePubkey: string;
  employeeName: string;
  title: string;
  asset?: string;
  ratePerSecondMinor: string;
  fundedAmountMinor: string;
  withdrawnAmountMinor: string;
  status: string;
  startedAt: string;
  cancelledAt?: string | null;
  completedAt?: string | null;
  lastWithdrawTxHash?: string | null;
  contractStreamId?: string | null;
  createTxHash?: string | null;
};

const STREAM_CONTRACT_ID = process.env.NEXT_PUBLIC_SOROBAN_STREAM_CONTRACT_ID ?? '';

function formatUsdc(minor: string): string {
  const n = BigInt(minor);
  const whole = n / 1_000_000n;
  const frac = n % 1_000_000n;
  return `${whole}.${frac.toString().padStart(6, '0')}`;
}

function rateToMonthly(minor: string): string {
  const monthly = (BigInt(minor) * 2_592_000n) / 1_000_000n;
  return monthly.toString();
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
    active: { label: 'Active', className: 'text-cyan-700 bg-cyan-50 border-cyan-200', icon: <Play className="w-3 h-3" /> },
    cancelled: { label: 'Cancelled', className: 'text-red-700 bg-red-50 border-red-200', icon: <XCircle className="w-3 h-3" /> },
    completed: { label: 'Completed', className: 'text-green-700 bg-green-50 border-green-200', icon: <CheckCircle2 className="w-3 h-3" /> },
    paused: { label: 'Paused', className: 'text-yellow-700 bg-yellow-50 border-yellow-200', icon: <Clock className="w-3 h-3" /> },
  };
  const { label, className, icon } = map[status] ?? map.active;
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium border ${className}`}>
      {icon} {label}
    </span>
  );
}

export default function StreamDetailPage() {
  const params = useParams();
  const locale = (params?.locale as string) ?? 'en';
  const id = params?.id as string;
  const { publicKey, isConnected } = useWallet();

  const [stream, setStream] = useState<StreamData | null>(null);
  const [loading, setLoading] = useState(true);
  const [withdrawing, setWithdrawing] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const sse = useStreamSSE(id);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/streams/${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) {
          const s = data.data.stream;
          setStream({
            ...s,
            startedAt: typeof s.startedAt === 'string' ? s.startedAt : new Date(s.startedAt).toISOString(),
          });
        }
      })
      .finally(() => setLoading(false));
  }, [id]);

  const isEmployer = stream && publicKey === stream.employerPubkey;
  const isEmployee = stream && publicKey === stream.employeePubkey;

  async function handleWithdraw() {
    if (!id) return;
    setWithdrawing(true);
    try {
      const res = await fetch(`/api/streams/${id}/withdraw`, { method: 'POST' });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error?.message ?? 'Withdrawal failed');
      toast.success(`Withdrew ${formatUsdc(data.data.amountMinor)} ${stream?.asset ?? 'XLM'}`);
      if (data.data.txHash && !String(data.data.txHash).startsWith('demo')) {
        toast.info('Payment confirmed on Stellar', {
          action: { label: 'View tx', onClick: () => window.open(txExplorerUrl(data.data.txHash), '_blank') },
        });
      }
      // Refresh stream
      const refreshRes = await fetch(`/api/streams/${id}`);
      const refreshData = await refreshRes.json();
      if (refreshData.ok) setStream({ ...refreshData.data.stream, startedAt: refreshData.data.stream.startedAt });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Withdrawal failed');
    } finally {
      setWithdrawing(false);
    }
  }

  async function handleCancel() {
    if (!id || !confirm('Cancel this stream? Unearned funds will be returned to you.')) return;
    setCancelling(true);
    try {
      const res = await fetch(`/api/streams/${id}/cancel`, { method: 'POST' });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error?.message ?? 'Cancel failed');
      toast.success(`Stream cancelled. Refund: ${formatUsdc(data.data.refundAmountMinor)} ${stream?.asset ?? 'XLM'}`);
      const refreshRes = await fetch(`/api/streams/${id}`);
      const refreshData = await refreshRes.json();
      if (refreshData.ok) setStream({ ...refreshData.data.stream, startedAt: refreshData.data.stream.startedAt });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Cancel failed');
    } finally {
      setCancelling(false);
    }
  }

  if (loading) {
    return (
      <>
        <Navbar locale={locale} />
        <main className="pt-16 min-h-screen flex items-center justify-center">
          <p className="text-muted-foreground">Loading stream…</p>
        </main>
      </>
    );
  }

  if (!stream) {
    return (
      <>
        <Navbar locale={locale} />
        <main className="pt-16 min-h-screen flex items-center justify-center">
          <div className="text-center">
            <p className="text-xl font-semibold mb-2">Stream not found</p>
            <Link href={`/${locale}/dashboard`} className="text-cyan-600 hover:underline">
              Back to Dashboard
            </Link>
          </div>
        </main>
      </>
    );
  }

  const displayStatus = sse.status ?? stream.status;
  const asset = stream.asset ?? 'XLM';

  return (
    <>
      <Navbar locale={locale} />
      <main className="pt-16 min-h-screen">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-sm mb-6">
            <Link href={`/${locale}/dashboard`} className="text-muted-foreground hover:text-foreground">
              Dashboard
            </Link>
            <span className="text-muted-foreground">/</span>
            <span className="text-foreground truncate max-w-xs">{stream.title}</span>
          </div>

          {/* Header */}
          <div className="flex items-start justify-between mb-8">
            <div>
              <h1 className="text-3xl font-heading font-bold mb-1">{stream.employeeName}</h1>
              <p className="text-muted-foreground">{stream.title}</p>
            </div>
            <StatusBadge status={displayStatus} />
          </div>

          {/* Live counter */}
          {displayStatus === 'active' && (
            <div className="rounded-xl border border-cyan-200 bg-cyan-50 dark:bg-cyan-950 dark:border-cyan-800 p-6 mb-6">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
                <p className="text-sm font-medium text-cyan-700 dark:text-cyan-300">
                  Claimable right now
                </p>
              </div>
              <DripCounter
                ratePerSecondMinor={stream.ratePerSecondMinor}
                fundedAmountMinor={stream.fundedAmountMinor}
                withdrawnAmountMinor={stream.withdrawnAmountMinor}
                startedAt={stream.startedAt}
                asset={asset}
                large
              />
              {isEmployee && (
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button
                    onClick={handleWithdraw}
                    disabled={withdrawing}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-cyan-600 text-white hover:bg-cyan-700 disabled:opacity-60 transition-colors font-medium"
                  >
                    {withdrawing ? 'Withdrawing…' : 'Withdraw Earned'}
                    {!withdrawing && <ArrowUpRight className="w-4 h-4" />}
                  </button>
                  {asset === 'USDC' && publicKey && <EnableUsdcButton publicKey={publicKey} />}
                </div>
              )}
            </div>
          )}

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="rounded-xl border border-border bg-card p-4 card-shadow">
              <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                <DollarSign className="w-3 h-3" /> Rate
              </p>
              <p className="font-mono font-bold">
                {rateToMonthly(stream.ratePerSecondMinor)} {asset}/mo
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {(Number(stream.ratePerSecondMinor) / 1_000_000).toFixed(6)} {asset}/sec
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4 card-shadow">
              <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                <Waves className="w-3 h-3" /> Funded
              </p>
              <p className="font-mono font-bold">{formatUsdc(stream.fundedAmountMinor)} {asset}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4 card-shadow">
              <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Withdrawn
              </p>
              <p className="font-mono font-bold">{formatUsdc(stream.withdrawnAmountMinor)} {asset}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4 card-shadow">
              <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                <Clock className="w-3 h-3" /> Started
              </p>
              <p className="font-medium text-sm">
                {new Date(stream.startedAt).toLocaleString()}
              </p>
            </div>
          </div>

          {/* Parties */}
          <div className="rounded-xl border border-border bg-card p-5 mb-6 card-shadow">
            <h3 className="font-semibold mb-3">Parties</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Employer</span>
                <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">
                  {stream.employerPubkey.slice(0, 8)}…{stream.employerPubkey.slice(-6)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Employee</span>
                <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">
                  {stream.employeePubkey.slice(0, 8)}…{stream.employeePubkey.slice(-6)}
                </span>
              </div>
            </div>
          </div>

          {/* On-chain stream (Soroban contract) */}
          {stream.contractStreamId && STREAM_CONTRACT_ID && (
            <div className="rounded-xl border border-cyan-200 dark:border-cyan-800 bg-cyan-50/50 dark:bg-cyan-950/40 p-5 mb-6 card-shadow">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Waves className="w-4 h-4 text-cyan-600" /> On-chain stream
              </h3>
              <p className="text-xs text-muted-foreground mb-3">
                This salary stream is escrowed in the AgosStream Soroban contract. Vesting is computed
                on-chain from ledger time — every withdrawal is a real Stellar transaction.
              </p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between items-center gap-2">
                  <span className="text-muted-foreground">Contract</span>
                  <a
                    href={contractExplorerUrl(STREAM_CONTRACT_ID)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-xs text-cyan-600 hover:underline inline-flex items-center gap-1"
                  >
                    {STREAM_CONTRACT_ID.slice(0, 8)}…{STREAM_CONTRACT_ID.slice(-6)}
                    <ArrowUpRight className="w-3 h-3 shrink-0" />
                  </a>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Stream id</span>
                  <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">
                    #{stream.contractStreamId}
                  </span>
                </div>
                {stream.createTxHash && (
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-muted-foreground">Funding tx</span>
                    <a
                      href={txExplorerUrl(stream.createTxHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-xs text-cyan-600 hover:underline inline-flex items-center gap-1"
                    >
                      {stream.createTxHash.slice(0, 10)}…
                      <ArrowUpRight className="w-3 h-3 shrink-0" />
                    </a>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Cancel button for employer */}
          {isEmployer && displayStatus === 'active' && (
            <div className="border-t border-border pt-6">
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground disabled:opacity-60 transition-colors font-medium text-sm"
              >
                <XCircle className="w-4 h-4" />
                {cancelling ? 'Cancelling…' : 'Cancel Stream'}
              </button>
              <p className="text-xs text-muted-foreground mt-2">
                Unearned funds will be returned to your wallet.
              </p>
            </div>
          )}

          {stream.lastWithdrawTxHash && !stream.lastWithdrawTxHash.startsWith('demo') && (
            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-xs text-muted-foreground">Last withdrawal tx</p>
              <a
                href={txExplorerUrl(stream.lastWithdrawTxHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs text-cyan-600 hover:underline mt-1 inline-flex items-center gap-1 break-all"
              >
                {stream.lastWithdrawTxHash}
                <ArrowUpRight className="w-3 h-3 shrink-0" />
              </a>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
