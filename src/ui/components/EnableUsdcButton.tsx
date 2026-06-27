'use client';

import { signTransaction } from '@stellar/freighter-api';
import { CheckCircle2, Coins, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { HORIZON_URL, NETWORK_PASSPHRASE } from '@/ui/lib/network';

type Props = {
  publicKey: string;
  className?: string;
  onEnabled?: () => void;
};

/**
 * One-tap "Enable USDC": builds a changeTrust tx server-side, signs it with the
 * connected Freighter wallet (network pinned to testnet), submits to Horizon.
 * XLM streams never need this — it is purely opt-in for receiving USDC.
 */
export function EnableUsdcButton({ publicKey, className = '', onEnabled }: Props) {
  const [busy, setBusy] = useState(false);
  const [trusted, setTrusted] = useState<boolean | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/trustline/usdc?publicKey=${publicKey}`);
      const json = await res.json();
      if (json.ok) setTrusted(json.data.trusted);
    } catch {
      /* ignore */
    }
  }, [publicKey]);

  useEffect(() => {
    if (publicKey) refresh();
  }, [publicKey, refresh]);

  async function enable() {
    setBusy(true);
    try {
      const buildRes = await fetch('/api/trustline/usdc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicKey }),
      });
      const build = await buildRes.json();
      if (!build.ok) throw new Error(build.error?.message ?? 'Could not build trustline');

      const signed = await signTransaction(build.data.xdr, {
        address: publicKey,
        networkPassphrase: NETWORK_PASSPHRASE,
      });
      if ('error' in signed && signed.error) throw new Error(String(signed.error));
      const { signedTxXdr } = signed as { signedTxXdr: string };

      const submit = await fetch(`${HORIZON_URL}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ tx: signedTxXdr }),
      });
      if (!submit.ok) {
        const body = await submit.text();
        throw new Error(/op_low_reserve/.test(body) ? 'Not enough XLM reserve for a trustline.' : 'Trustline submission failed.');
      }
      toast.success('USDC enabled on your wallet');
      setTrusted(true);
      onEnabled?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not enable USDC');
    } finally {
      setBusy(false);
    }
  }

  if (trusted) {
    return (
      <span className={`inline-flex items-center gap-1.5 text-sm text-emerald-600 ${className}`}>
        <CheckCircle2 className="h-4 w-4" /> USDC enabled
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={enable}
      disabled={busy}
      className={`inline-flex items-center gap-2 rounded-lg border border-teal-300 bg-teal-50 px-4 py-2 text-sm font-medium text-teal-800 transition-colors hover:bg-teal-100 disabled:opacity-60 dark:border-teal-800 dark:bg-teal-950 dark:text-teal-200 ${className}`}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Coins className="h-4 w-4" />}
      {busy ? 'Enabling…' : 'Enable USDC'}
    </button>
  );
}
