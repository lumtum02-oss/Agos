'use client';

import { ArrowUpRight, Info } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

type Asset = 'XLM' | 'USDC';

type Props = {
  publicKey: string;
  locale: string;
};

function amountToMinor(value: string): string {
  const [whole = '0', frac = ''] = value.split('.');
  const fracStr = frac.padEnd(6, '0').slice(0, 6);
  return (BigInt(whole || '0') * 1_000_000n + BigInt(fracStr || '0')).toString();
}

function monthlyToRatePerSecond(monthly: string): string {
  // 1 month ≈ 30 × 24 × 3600 = 2,592,000 seconds
  const minor = BigInt(amountToMinor(monthly));
  const rate = minor / 2_592_000n;
  return rate === 0n && minor > 0n ? '1' : rate.toString();
}

export function CreateStreamForm({ publicKey, locale }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [asset, setAsset] = useState<Asset>('XLM');
  const [form, setForm] = useState({
    employeePubkey: '',
    employeeName: '',
    title: '',
    monthly: '',
    funded: '',
  });

  const rateMinor = form.monthly ? monthlyToRatePerSecond(form.monthly) : '0';
  const ratePerSec = (Number(rateMinor) / 1_000_000).toFixed(6);

  function setField(k: keyof typeof form, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (Number(form.funded) <= 0 || Number(form.monthly) <= 0) {
      toast.error('Enter a positive monthly rate and funding amount');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/streams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeePubkey: form.employeePubkey.trim(),
          employeeName: form.employeeName.trim(),
          title: form.title.trim(),
          asset,
          ratePerSecondMinor: rateMinor,
          fundedAmountMinor: amountToMinor(form.funded),
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error?.message ?? 'Failed to create stream');
      toast.success('Stream created');
      router.push(`/${locale}/streams/${data.data.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create stream');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Asset selector — XLM default, USDC opt-in */}
      <div>
        <span className="mb-2 block text-sm font-medium text-foreground">Settlement asset</span>
        <div className="grid grid-cols-2 gap-3">
          {(['XLM', 'USDC'] as const).map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setAsset(a)}
              className={`rounded-xl border p-3 text-left transition-colors ${
                asset === a
                  ? 'border-cyan-500 bg-cyan-50 ring-1 ring-cyan-500 dark:bg-cyan-950'
                  : 'border-input hover:border-cyan-300'
              }`}
            >
              <p className="font-semibold">{a}</p>
              <p className="text-xs text-muted-foreground">
                {a === 'XLM' ? 'Native · no trustline · works instantly' : 'Stablecoin · needs trustline'}
              </p>
            </button>
          ))}
        </div>
        {asset === 'USDC' && (
          <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            The contractor must enable USDC on their wallet (one tap) before they can withdraw. XLM
            needs no setup.
          </p>
        )}
      </div>

      <div>
        <label htmlFor="addr" className="mb-1.5 block text-sm font-medium">
          Contractor Stellar address
        </label>
        <input
          id="addr"
          type="text"
          placeholder="G…"
          value={form.employeePubkey}
          onChange={(e) => setField('employeePubkey', e.target.value)}
          required
          className="w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className="mb-1.5 block text-sm font-medium">
            Stream label
          </label>
          <input
            id="name"
            type="text"
            placeholder="Recipient or team name"
            value={form.employeeName}
            onChange={(e) => setField('employeeName', e.target.value)}
            required
            maxLength={60}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
        </div>
        <div>
          <label htmlFor="title" className="mb-1.5 block text-sm font-medium">
            Work / role
          </label>
          <input
            id="title"
            type="text"
            placeholder="e.g. Backend development"
            value={form.title}
            onChange={(e) => setField('title', e.target.value)}
            required
            maxLength={80}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="monthly" className="mb-1.5 block text-sm font-medium">
            Monthly rate ({asset})
          </label>
          <input
            id="monthly"
            type="number"
            step="0.000001"
            min="0"
            placeholder="500"
            value={form.monthly}
            onChange={(e) => setField('monthly', e.target.value)}
            required
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
          {form.monthly && (
            <p className="mt-1 text-xs text-muted-foreground">≈ {ratePerSec} {asset}/sec</p>
          )}
        </div>
        <div>
          <label htmlFor="funded" className="mb-1.5 block text-sm font-medium">
            Total to fund ({asset})
          </label>
          <input
            id="funded"
            type="number"
            step="0.000001"
            min="0"
            placeholder="1000"
            value={form.funded}
            onChange={(e) => setField('funded', e.target.value)}
            required
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
        </div>
      </div>

      <div className="rounded-lg bg-cyan-50 p-4 text-sm dark:bg-cyan-950/60">
        <p className="text-muted-foreground">
          <strong className="text-foreground">How it works:</strong> earnings accrue every second at{' '}
          {ratePerSec !== '0.000000' ? `${ratePerSec} ${asset}/sec` : 'your set rate'}. The recipient
          withdraws any time and a real {asset} payment fires on Stellar testnet. Cancel any time and
          unearned funds return to you.
        </p>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-cyan-600 px-6 py-3 font-medium text-white transition-colors hover:bg-cyan-700 disabled:opacity-60"
      >
        {loading ? 'Creating…' : 'Create stream'}
        {!loading && <ArrowUpRight className="h-4 w-4" />}
      </button>
    </form>
  );
}
