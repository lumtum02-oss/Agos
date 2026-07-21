'use client';

/**
 * Client-side Stellar network constants, pinned to the APP's configured network
 * (NEXT_PUBLIC_STELLAR_NETWORK) — NOT the wallet's active network. This makes
 * SEP-10 connect and trustline signing work even if Freighter is on Mainnet.
 */
export const STELLAR_NETWORK = (process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? 'testnet') as
  | 'testnet'
  | 'public';

export const NETWORK_PASSPHRASE =
  STELLAR_NETWORK === 'public'
    ? 'Public Global Stellar Network ; September 2015'
    : 'Test SDF Network ; September 2015';

export const HORIZON_URL =
  STELLAR_NETWORK === 'public'
    ? 'https://horizon.stellar.org'
    : 'https://horizon-testnet.stellar.org';

export function txExplorerUrl(hash: string): string {
  const net = STELLAR_NETWORK === 'public' ? 'public' : 'testnet';
  return `https://stellar.expert/explorer/${net}/tx/${hash}`;
}

export function contractExplorerUrl(contractId: string): string {
  const net = STELLAR_NETWORK === 'public' ? 'public' : 'testnet';
  return `https://stellar.expert/explorer/${net}/contract/${contractId}`;
}

export function shortAddr(addr: string): string {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}
