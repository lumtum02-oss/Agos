/**
 * Reference TypeScript client for the AgosStream Soroban contract.
 *
 * The Agos app invokes the contract server-side with the hub key (see the
 * production client at `src/server/stellar/soroban.ts`). This file is a compact,
 * dependency-light reference of the same calls for anyone integrating the
 * contract from their own backend.
 *
 * Depends only on `@stellar/stellar-sdk`.
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

export interface AgosStreamConfig {
  rpcUrl: string;
  contractId: string;
  networkPassphrase: string;
  /** Secret of the hub/payer that signs writes (= contract admin & payer). */
  hubSecret: string;
}

const u64 = (v: bigint | number) => nativeToScVal(BigInt(v), { type: 'u64' });
const i128 = (v: bigint | string) => nativeToScVal(BigInt(v), { type: 'i128' });
const addr = (v: string) => new Address(v).toScVal();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class AgosStreamClient {
  private readonly server: rpc.Server;
  private readonly contract: Contract;
  private readonly kp: Keypair;

  constructor(private readonly cfg: AgosStreamConfig) {
    this.server = new rpc.Server(cfg.rpcUrl, { allowHttp: cfg.rpcUrl.startsWith('http://') });
    this.contract = new Contract(cfg.contractId);
    this.kp = Keypair.fromSecret(cfg.hubSecret);
  }

  /** Build → prepare → sign (hub) → submit → poll, with transient-RPC retries. */
  private async invoke(method: string, args: xdr.ScVal[]): Promise<{ hash: string; ret: unknown }> {
    const src = this.kp.publicKey();
    for (let attempt = 1; attempt <= 9; attempt++) {
      try {
        const account: Account = await this.server.getAccount(src);
        const tx = new TransactionBuilder(account, {
          fee: (Number(BASE_FEE) * 100).toString(),
          networkPassphrase: this.cfg.networkPassphrase,
        })
          .addOperation(this.contract.call(method, ...args))
          .setTimeout(120)
          .build();
        const prepared = await this.server.prepareTransaction(tx);
        prepared.sign(this.kp);
        const sent = await this.server.sendTransaction(prepared);
        if (sent.status !== 'PENDING') {
          if (attempt < 9) { await sleep(3000); continue; }
          throw new Error(`send ${sent.status}`);
        }
        let got = await this.server.getTransaction(sent.hash);
        const dl = Date.now() + 28_000;
        while (got.status === 'NOT_FOUND' && Date.now() < dl) {
          await sleep(1500);
          got = await this.server.getTransaction(sent.hash);
        }
        if (got.status === 'SUCCESS') {
          return { hash: sent.hash, ret: got.returnValue ? scValToNative(got.returnValue) : null };
        }
        if (got.status === 'NOT_FOUND' && attempt < 9) { await sleep(3000); continue; }
        throw new Error(`tx ${got.status}`);
      } catch (err) {
        const m = String(err);
        if (/BadSeq|timeout|fetch failed|TRY_AGAIN|Contract, #6/i.test(m) && attempt < 9) {
          await sleep(3000);
          continue;
        }
        throw err;
      }
    }
    throw new Error(`invoke ${method} exhausted retries`);
  }

  createStream(payer: string, recipient: string, totalAmount: bigint, start: number, end: number) {
    return this.invoke('create_stream', [
      addr(payer), addr(recipient), i128(totalAmount), u64(start), u64(end),
    ]);
  }

  withdraw(streamId: bigint | number) {
    return this.invoke('withdraw', [u64(streamId)]);
  }

  stop(streamId: bigint | number) {
    return this.invoke('stop', [u64(streamId)]);
  }

  async withdrawable(streamId: bigint | number): Promise<bigint> {
    const src = this.kp.publicKey();
    const account = await this.server.getAccount(src);
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.cfg.networkPassphrase,
    })
      .addOperation(this.contract.call('withdrawable', u64(streamId)))
      .setTimeout(60)
      .build();
    const sim = await this.server.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(sim)) throw new Error(sim.error);
    return (sim.result?.retval ? (scValToNative(sim.result.retval) as bigint) : 0n) ?? 0n;
  }
}
