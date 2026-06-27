'use client';

import { useParams } from 'next/navigation';
import { Waves } from 'lucide-react';
import { Navbar } from '@/ui/components/layout/Navbar';
import { CreateStreamForm } from '@/ui/components/CreateStreamForm';
import { useWallet } from '@/ui/hooks/useWallet';
import Link from 'next/link';

export default function NewStreamPage() {
  const params = useParams();
  const locale = (params?.locale as string) ?? 'en';
  const { publicKey, isConnected, connect } = useWallet();

  return (
    <>
      <Navbar locale={locale} />
      <main className="pt-16 min-h-screen">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-12">
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-2">
              <Waves className="w-5 h-5 text-cyan-600" />
              <Link
                href={`/${locale}/dashboard`}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Dashboard
              </Link>
              <span className="text-muted-foreground">/</span>
              <span className="text-sm text-foreground">New Stream</span>
            </div>
            <h1 className="text-3xl font-heading font-bold">New Salary Stream</h1>
            <p className="text-muted-foreground mt-1">
              Set up per-second payments — pay in XLM by default, or switch to USDC
            </p>
          </div>

          {!isConnected ? (
            <div className="text-center py-12 border border-dashed border-border rounded-xl">
              <p className="text-muted-foreground mb-4">Connect your wallet to create a stream</p>
              <button
                onClick={connect}
                className="px-6 py-2.5 rounded-lg bg-cyan-600 text-white hover:bg-cyan-700 transition-colors font-medium"
              >
                Connect Wallet
              </button>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card p-6 card-shadow">
              <CreateStreamForm publicKey={publicKey!} locale={locale} />
            </div>
          )}
        </div>
      </main>
    </>
  );
}
