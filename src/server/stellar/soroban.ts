/**
 * Server-side client for the AgosStream Soroban contract.
 *
 * Unlike a Freighter-signed flow, every stream operation here is invoked by the
 * Agos hub key (which is also the contract admin and the on-chain payer): the
 * server builds → simulates/prepares → signs → submits → polls, all in Node.
 * Reads (`get_stream`, `vested_amount`, `withdrawable`) are pure simulations and
 * never touch a key or pay a fee.
 *
 * Vesting is computed *on-chain* from ledger time, so there is no server timer:
 * the available amount is derived fresh on every read and withdrawal.
 */
import {
  Account,
  Address,
  BASE_FEE,
  Contract,
  Keypair,
  nativeToScVal,
  rpc,
  scValToNative,
  TransactionBuilder,
  type xdr,
} from '@stellar/stellar-sdk';
import { env } from '@/server/config/env';
import { getNetworkPassphrase } from './network';
import { logger } from '@/server/lib/logger';

export type ContractStream = {
  payer: string;
  recipient: string;
  token: string;
  total_amount: bigint;
  withdrawn_amount: bigint;
  start_time: bigint;
  end_time: bigint;
  status: number; // 0 Active, 1 Completed, 2 Stopped
};

function server(): rpc.Server {
  return new rpc.Server(env.SOROBAN_RPC_URL, {
    allowHttp: env.SOROBAN_RPC_URL.startsWith('http://'),
  });
}

function contract(): Contract {
  if (!env.SOROBAN_STREAM_CONTRACT_ID) {
    throw new Error('SOROBAN_STREAM_CONTRACT_ID is not configured');
  }
  return new Contract(env.SOROBAN_STREAM_CONTRACT_ID);
}

function hubKeypair(): Keypair {
  if (!env.HUB_STELLAR_SECRET) {
    throw new Error('HUB_STELLAR_SECRET is not configured');
  }
  return Keypair.fromSecret(env.HUB_STELLAR_SECRET);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Is this contract wiring usable (XLM streams settle through the contract)? */
export function sorobanEnabled(): boolean {
  return Boolean(env.SOROBAN_STREAM_CONTRACT_ID && env.HUB_STELLAR_SECRET);
}

/**
 * Build → prepare → sign (hub) → submit → poll an invoke. Retries the handful
 * of transient testnet-RPC faults (stale sequence `TxBadSeq`, submission
 * timeout) by refetching the account each attempt. Returns the tx hash and the
 * decoded contract return value.
 */
async function invokeSigned(
  method: string,
  args: xdr.ScVal[],
): Promise<{ hash: string; returnValue: unknown }> {
  const srv = server();
  const kp = hubKeypair();
  const source = kp.publicKey();
  const passphrase = getNetworkPassphrase();

  const MAX = 9;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX; attempt++) {
    try {
      const account: Account = await srv.getAccount(source);
      const built = new TransactionBuilder(account, {
        fee: (Number(BASE_FEE) * 100).toString(),
        networkPassphrase: passphrase,
      })
        .addOperation(contract().call(method, ...args))
        .setTimeout(120)
        .build();

      const prepared = await srv.prepareTransaction(built);
      prepared.sign(kp);

      const sent = await srv.sendTransaction(prepared);
      // PENDING = accepted to mempool. Anything else (ERROR/TRY_AGAIN_LATER/
      // DUPLICATE) = resubmit with a fresh sequence (testnet RPC lag returns
      // stale seqs / rate-limits right after a prior tx).
      if (sent.status !== 'PENDING') {
        const msg = JSON.stringify(sent.errorResult ?? sent.status);
        if (attempt < MAX) {
          logger.info('soroban.resubmit', { method, attempt, status: sent.status });
          await sleep(2500 + attempt * 800);
          continue;
        }
        throw new Error(`Soroban send failed (${method}): ${msg}`);
      }

      let got = await srv.getTransaction(sent.hash);
      const deadline = Date.now() + 28_000;
      while (got.status === 'NOT_FOUND' && Date.now() < deadline) {
        await sleep(1500);
        got = await srv.getTransaction(sent.hash);
      }
      if (got.status === 'SUCCESS') {
        const ret = got.returnValue ? scValToNative(got.returnValue) : null;
        return { hash: sent.hash, returnValue: ret };
      }
      if (got.status === 'NOT_FOUND' && attempt < MAX) {
        // Never confirmed (likely held/dropped on a stale seq) — rebuild & retry.
        logger.info('soroban.timeout_retry', { method, attempt });
        await sleep(2500 + attempt * 800);
        continue;
      }
      throw new Error(`Soroban tx ${method} did not succeed: ${got.status}`);
    } catch (err) {
      lastErr = err;
      const msg = String(err);
      // `Contract, #6` (StreamNotFound) right after create() is RPC read-lag, not
      // a real revert — our callers only act on ids we just persisted, so retry.
      if (
        /BadSeq|txBadSeq|timeout|fetch failed|TRY_AGAIN|Contract, #6/i.test(msg) &&
        attempt < MAX
      ) {
        logger.info('soroban.retry', { method, attempt, err: msg.slice(0, 120) });
        await sleep(2500 + attempt * 800);
        continue;
      }
      throw err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/** Read-only simulation of a view method (retries transient RPC read-lag). */
async function simulate(method: string, args: xdr.ScVal[]): Promise<unknown> {
  const srv = server();
  const source = hubKeypair().publicKey();
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const account = await srv.getAccount(source);
      const tx = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: getNetworkPassphrase(),
      })
        .addOperation(contract().call(method, ...args))
        .setTimeout(60)
        .build();

      const sim = await srv.simulateTransaction(tx);
      if (rpc.Api.isSimulationError(sim)) {
        if (/Contract, #6/i.test(sim.error) && attempt < 5) {
          await sleep(2500);
          continue;
        }
        throw new Error(`simulate ${method} failed: ${sim.error}`);
      }
      const retval = sim.result?.retval;
      return retval ? scValToNative(retval) : null;
    } catch (err) {
      lastErr = err;
      if (/fetch failed|timeout|Contract, #6/i.test(String(err)) && attempt < 5) {
        await sleep(2500);
        continue;
      }
      throw err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

const u64 = (v: bigint | number) => nativeToScVal(BigInt(v), { type: 'u64' });
const i128 = (v: bigint | string) => nativeToScVal(BigInt(v), { type: 'i128' });
const addr = (v: string) => new Address(v).toScVal();

export const sorobanStream = {
  /** Fund and open a new on-chain stream. Returns the contract stream id + tx hash. */
  async createStream(opts: {
    payer: string;
    recipient: string;
    totalStroops: bigint;
    startTime: number;
    endTime: number;
  }): Promise<{ streamId: string; txHash: string }> {
    const { hash, returnValue } = await invokeSigned('create_stream', [
      addr(opts.payer),
      addr(opts.recipient),
      i128(opts.totalStroops),
      u64(opts.startTime),
      u64(opts.endTime),
    ]);
    return { streamId: String(returnValue as bigint), txHash: hash };
  },

  /** Withdraw all vested-but-unwithdrawn funds to the stream recipient. */
  async withdraw(streamId: string): Promise<{ amountStroops: bigint; txHash: string }> {
    const { hash, returnValue } = await invokeSigned('withdraw', [u64(BigInt(streamId))]);
    return { amountStroops: returnValue as bigint, txHash: hash };
  },

  /** Stop a stream: settle vested to recipient, reclaim the remainder to payer. */
  async stop(streamId: string): Promise<{ reclaimStroops: bigint; txHash: string }> {
    const { hash, returnValue } = await invokeSigned('stop', [u64(BigInt(streamId))]);
    return { reclaimStroops: returnValue as bigint, txHash: hash };
  },

  /** Amount (stroops) the recipient could withdraw right now. */
  async withdrawable(streamId: string): Promise<bigint> {
    const v = await simulate('withdrawable', [u64(BigInt(streamId))]);
    return (v as bigint) ?? 0n;
  },

  /** Read the full on-chain stream record. */
  async getStream(streamId: string): Promise<ContractStream> {
    const v = await simulate('get_stream', [u64(BigInt(streamId))]);
    return v as ContractStream;
  },
};
