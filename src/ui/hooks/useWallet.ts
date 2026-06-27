'use client';

import {
  getAddress as freighterGetAddress,
  isConnected as freighterIsConnected,
  requestAccess as freighterRequestAccess,
  signTransaction as freighterSignTransaction,
} from '@stellar/freighter-api';
import { useEffect, useSyncExternalStore } from 'react';
import { NETWORK_PASSPHRASE } from '@/ui/lib/network';

type WalletState = {
  publicKey: string | null;
  isAvailable: boolean;
  isConnected: boolean;
  isConnecting: boolean;
  loading: boolean;
  error: string | null;
};

const INITIAL: WalletState = {
  publicKey: null,
  isAvailable: false,
  isConnected: false,
  isConnecting: false,
  loading: true,
  error: null,
};

const SESSION_KEY = 'agos_connected_pubkey';

export type { WalletState };

/**
 * Wallet state is a single SHARED store (module-level), not per-component local
 * state: connecting in the navbar must instantly update the dashboard body and
 * every other mounted consumer. All `useWallet()` callers subscribe to the same
 * store via `useSyncExternalStore`.
 */
let state: WalletState = INITIAL;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}
function setState(next: Partial<WalletState> | ((s: WalletState) => WalletState)) {
  state = typeof next === 'function' ? next(state) : { ...state, ...next };
  emit();
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
const getSnapshot = () => state;
const getServerSnapshot = () => INITIAL;

/**
 * Race a Freighter API call against a timeout. Freighter v6 isConnected()
 * resolves { isConnected: false } for users without the extension, but the
 * message-passing layer can hang in edge cases. Timeout forces the store to
 * settle so the UI can degrade gracefully.
 */
function withTimeout<T>(promise: PromiseLike<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Freighter ${label} timed out after ${ms}ms`)),
      ms,
    );
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  }) as Promise<T>;
}

const AVAILABILITY_TIMEOUT_MS = 2_000;
const SIGN_TIMEOUT_MS = 90_000;

let initStarted = false;
async function initOnce() {
  if (initStarted) return;
  initStarted = true;

  const stored = typeof window !== 'undefined' ? sessionStorage.getItem(SESSION_KEY) : null;
  try {
    const { isConnected: connected } = await withTimeout(
      freighterIsConnected(),
      AVAILABILITY_TIMEOUT_MS,
      'isConnected',
    );
    if (!connected) {
      setState({ ...INITIAL, loading: false });
      return;
    }
    try {
      const { address } = await withTimeout(
        freighterGetAddress(),
        AVAILABILITY_TIMEOUT_MS,
        'getAddress',
      );
      if (address && (stored === address || stored)) {
        setState({
          publicKey: address || stored,
          isAvailable: true,
          isConnected: true,
          isConnecting: false,
          loading: false,
          error: null,
        });
      } else {
        setState({ ...INITIAL, isAvailable: true, loading: false });
      }
    } catch {
      setState({ ...INITIAL, isAvailable: true, loading: false });
    }
  } catch {
    setState({ ...INITIAL, loading: false });
  }
}

async function connect() {
  setState((s) => ({ ...s, isConnecting: true, error: null }));
  try {
    const { address } = await withTimeout(
      freighterRequestAccess(),
      AVAILABILITY_TIMEOUT_MS,
      'requestAccess',
    );
    if (!address) throw new Error('No address returned from Freighter');

    // SEP-10 challenge-response to establish the server session.
    const challengeRes = await fetch('/api/auth/challenge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ publicKey: address }),
    });
    const challengeData = await challengeRes.json();
    if (!challengeData.ok) throw new Error(challengeData.error?.message ?? 'Challenge failed');

    const { txXdr } = challengeData.data;

    // Pin the network passphrase to the APP's configured network (testnet), NOT
    // the wallet's active network — connect works even if Freighter is on Mainnet.
    const signResult = await withTimeout(
      freighterSignTransaction(txXdr, {
        address,
        networkPassphrase: NETWORK_PASSPHRASE,
      }),
      SIGN_TIMEOUT_MS,
      'signTransaction',
    );
    if ('error' in signResult && signResult.error) {
      throw new Error(String(signResult.error));
    }
    const { signedTxXdr } = signResult as { signedTxXdr: string };

    const verifyRes = await fetch('/api/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ publicKey: address, signedNonce: signedTxXdr }),
    });
    const verifyData = await verifyRes.json();
    if (!verifyData.ok) throw new Error(verifyData.error?.message ?? 'Verify failed');

    if (typeof window !== 'undefined') sessionStorage.setItem(SESSION_KEY, address);
    setState({
      publicKey: address,
      isAvailable: true,
      isConnected: true,
      isConnecting: false,
      loading: false,
      error: null,
    });
  } catch (err) {
    setState((s) => ({
      ...s,
      isConnecting: false,
      error: err instanceof Error ? err.message : String(err),
    }));
  }
}

async function disconnect() {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch {
    // ignore logout errors
  }
  if (typeof window !== 'undefined') sessionStorage.removeItem(SESSION_KEY);
  setState((s) => ({ ...INITIAL, isAvailable: s.isAvailable, loading: false }));
}

export function useWallet() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  useEffect(() => {
    void initOnce();
  }, []);
  return { ...snapshot, connect, disconnect };
}
