'use client';

import { Waves } from 'lucide-react';
import Link from 'next/link';
import { WalletConnect } from '@/ui/components/WalletConnect';

type Props = {
  locale: string;
};

export function Navbar({ locale }: Props) {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background/80 backdrop-blur-sm">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <Link href={`/${locale}`} className="flex items-center gap-2 font-bold text-lg">
          <Waves className="w-6 h-6 text-cyan-600" />
          <span className="font-heading text-foreground">Agos</span>
        </Link>

        <div className="flex items-center gap-4">
          <Link
            href={`/${locale}/dashboard`}
            className="hidden sm:inline text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Dashboard
          </Link>
          <Link
            href={`/${locale}/stats`}
            className="hidden sm:inline text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Stats
          </Link>
          <WalletConnect />
        </div>
      </div>
    </nav>
  );
}
