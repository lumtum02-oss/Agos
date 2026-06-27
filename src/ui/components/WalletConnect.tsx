'use client';

import { Waves, Wallet, LogOut, Loader2 } from 'lucide-react';
import { useWallet } from '@/ui/hooks/useWallet';

export function WalletConnect() {
  const { publicKey, isConnected, isConnecting, connect, disconnect } = useWallet();

  if (isConnected && publicKey) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground font-mono">
          {publicKey.slice(0, 4)}…{publicKey.slice(-4)}
        </span>
        <button
          onClick={disconnect}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border border-border hover:bg-muted transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={connect}
      disabled={isConnecting}
      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-600 text-white hover:bg-cyan-700 disabled:opacity-60 transition-colors font-medium text-sm"
    >
      {isConnecting ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          Connecting…
        </>
      ) : (
        <>
          <Wallet className="w-4 h-4" />
          Connect Wallet
        </>
      )}
    </button>
  );
}
