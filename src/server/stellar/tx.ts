import { AppError } from '@/server/lib/http';
import { getHorizonUrl } from './network';

/**
 * Shapes we care about from Horizon.
 */
export type HorizonPayment = {
  id: string;
  type:
    | 'payment'
    | 'path_payment_strict_send'
    | 'path_payment_strict_receive'
    | 'create_account'
    | 'account_merge';
  amount: string;
  asset_type: 'native' | 'credit_alphanum4' | 'credit_alphanum12';
  asset_code?: string;
  asset_issuer?: string;
  from: string;
  to: string;
  transaction_hash: string;
  transaction_successful: boolean;
  created_at: string;
};

export type HorizonTransaction = {
  hash: string;
  ledger: number;
  created_at: string;
  source_account: string;
  successful: boolean;
  fee_charged: string;
  max_fee: string;
  operation_count: number;
  envelope_xdr: string;
  result_xdr: string;
  memo_type: string;
  memo?: string;
  memo_bytes?: string;
};

type HorizonError = {
  response?: { status?: number; data?: { status?: number; title?: string; detail?: string } };
};

async function horizonFetch<T>(path: string): Promise<T> {
  const url = `${getHorizonUrl().replace(/\/$/, '')}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    throw new AppError('INTERNAL', `Horizon request failed: ${String(err)}`, 502);
  }
  if (res.status === 404) {
    const err = new Error('Not found') as HorizonError & Error;
    err.response = { status: 404 };
    throw err;
  }
  if (!res.ok) {
    throw new AppError('INTERNAL', `Horizon returned ${res.status}`, 502);
  }
  return (await res.json()) as T;
}

export async function getTransaction(hash: string): Promise<HorizonTransaction> {
  try {
    return await horizonFetch<HorizonTransaction>(`/transactions/${hash}`);
  } catch (err) {
    if ((err as HorizonError).response?.status === 404) {
      throw new AppError('NOT_FOUND', 'Transaction not found', 404);
    }
    throw err;
  }
}

export async function getTransactionPayments(hash: string): Promise<HorizonPayment[]> {
  type Resp = { _embedded: { records: HorizonPayment[] } };
  const resp = await horizonFetch<Resp>(`/transactions/${hash}/payments`);
  return resp._embedded.records;
}

export type AccountBalance = { asset_code: string; asset_issuer: string; balance: string };

export async function getAccountBalances(account: string): Promise<AccountBalance[]> {
  type Account = {
    balances: Array<{
      asset_type: string;
      asset_code?: string;
      asset_issuer?: string;
      balance: string;
    }>;
  };
  try {
    const acct = await horizonFetch<Account>(`/accounts/${account}`);
    return acct.balances
      .filter((b) => b.asset_type !== 'native' && b.asset_code && b.asset_issuer)
      .map((b) => ({
        asset_code: b.asset_code as string,
        asset_issuer: b.asset_issuer as string,
        balance: b.balance,
      }));
  } catch (err) {
    if ((err as HorizonError).response?.status === 404) {
      return [];
    }
    throw err;
  }
}

export async function accountExists(publicKey: string): Promise<boolean> {
  try {
    await horizonFetch<unknown>(`/accounts/${publicKey}`);
    return true;
  } catch (err) {
    if ((err as HorizonError).response?.status === 404) return false;
    throw err;
  }
}

/**
 * Send an asset payment (native XLM or USDC) from the hub secret key to a recipient.
 * Returns transaction hash on success.
 */
export async function sendAssetPayment(opts: {
  fromSecret: string;
  toPublicKey: string;
  asset: 'XLM' | 'USDC';
  amount: string; // decimal string e.g. "12.340000"
  memo?: string;
}): Promise<string> {
  const {
    Account,
    BASE_FEE,
    Keypair,
    Operation,
    TransactionBuilder,
  } = await import('@stellar/stellar-sdk');
  const { getNetworkPassphrase, assetFor } = await import('./network');

  const sourceKeypair = Keypair.fromSecret(opts.fromSecret);
  const sourcePublicKey = sourceKeypair.publicKey();

  // Load account sequence
  const accountUrl = `${getHorizonUrl().replace(/\/$/, '')}/accounts/${sourcePublicKey}`;
  const accountRes = await fetch(accountUrl, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!accountRes.ok) {
    throw new AppError('INTERNAL', `Failed to load source account: ${accountRes.status}`, 502);
  }
  const accountData = (await accountRes.json()) as { sequence: string };
  const account = new Account(sourcePublicKey, accountData.sequence);

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: getNetworkPassphrase(),
  })
    .addOperation(
      Operation.payment({
        destination: opts.toPublicKey,
        asset: assetFor(opts.asset),
        amount: opts.amount,
      }),
    )
    .setTimeout(30)
    .build();

  tx.sign(sourceKeypair);
  const txXdr = tx.toXDR();

  // Submit
  const submitUrl = `${getHorizonUrl().replace(/\/$/, '')}/transactions`;
  const submitRes = await fetch(submitUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ tx: txXdr }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!submitRes.ok) {
    const errBody = await submitRes.text();
    throw new AppError('INTERNAL', `Transaction submission failed: ${errBody}`, 502);
  }

  const result = (await submitRes.json()) as { hash: string };
  return result.hash;
}

/**
 * Build an UNSIGNED changeTrust transaction (USDC trustline) for a wallet to sign
 * with Freighter. Returns the base64 XDR. The client signs + submits to Horizon.
 */
export async function buildUsdcTrustlineXdr(publicKey: string): Promise<string> {
  const { Account, BASE_FEE, Operation, TransactionBuilder } = await import(
    '@stellar/stellar-sdk'
  );
  const { getNetworkPassphrase, usdcAsset } = await import('./network');

  const accountUrl = `${getHorizonUrl().replace(/\/$/, '')}/accounts/${publicKey}`;
  const accountRes = await fetch(accountUrl, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });
  if (accountRes.status === 404) {
    throw new AppError(
      'NOT_FOUND',
      'Account not found on the network. Fund it with testnet XLM first.',
      404,
    );
  }
  if (!accountRes.ok) {
    throw new AppError('INTERNAL', `Failed to load account: ${accountRes.status}`, 502);
  }
  const accountData = (await accountRes.json()) as { sequence: string };
  const account = new Account(publicKey, accountData.sequence);

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: getNetworkPassphrase(),
  })
    .addOperation(Operation.changeTrust({ asset: usdcAsset() }))
    .setTimeout(180)
    .build();

  return tx.toXDR();
}

/** Does this account already hold a USDC trustline? */
export async function hasUsdcTrustline(publicKey: string): Promise<boolean> {
  const { usdcIssuer, usdcCode } = await import('./network');
  const balances = await getAccountBalances(publicKey);
  return balances.some((b) => b.asset_code === usdcCode() && b.asset_issuer === usdcIssuer());
}
