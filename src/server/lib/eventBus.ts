import { EventEmitter } from 'node:events';

/**
 * In-process typed event bus for SSE fan-out from stream updates
 * to per-request SSE handlers.
 *
 * Constraints:
 *   - In-process only: cross-instance fan-out needs Postgres LISTEN/NOTIFY or
 *     Redis pub/sub. Phase 1 runs one process so this is fine.
 *   - Subscribers are cleaned up via the `AbortSignal` returned by `subscribe`.
 *   - Callbacks are invoked via setImmediate so one bad subscriber cannot block.
 */

export type EventMap = {
  'stream.updated': StreamEvent;
  'stream.withdrawn': WithdrawalEvent;
};

export type StreamEvent = {
  streamId: string;
  version: number;
  status: string;
  withdrawnAmountMinor: string;
  occurredAt: Date;
};

export type WithdrawalEvent = {
  streamId: string;
  withdrawalId: string;
  amountMinor: string;
  txHash: string | null;
  status: string;
  occurredAt: Date;
};

type Topic = keyof EventMap;

class TypedBus {
  private readonly emitter = new EventEmitter();
  private readonly counts = new Map<Topic, number>();

  constructor() {
    this.emitter.setMaxListeners(1000);
  }

  publish<T extends Topic>(topic: T, payload: EventMap[T]): void {
    setImmediate(() => this.emitter.emit(topic, payload));
  }

  subscribe<T extends Topic>(
    topic: T,
    callback: (payload: EventMap[T]) => void,
    signal?: AbortSignal,
  ): () => void {
    this.emitter.on(topic, callback as (...args: unknown[]) => void);
    const count = (this.counts.get(topic) ?? 0) + 1;
    this.counts.set(topic, count);
    const unsubscribe = () => {
      this.emitter.off(topic, callback as (...args: unknown[]) => void);
      const next = (this.counts.get(topic) ?? 1) - 1;
      this.counts.set(topic, Math.max(0, next));
    };
    if (signal) {
      if (signal.aborted) {
        unsubscribe();
      } else {
        signal.addEventListener('abort', () => unsubscribe(), { once: true });
      }
    }
    return unsubscribe;
  }

  subscriberCount(topic: Topic): number {
    return this.counts.get(topic) ?? 0;
  }

  reset(): void {
    this.emitter.removeAllListeners();
    this.counts.clear();
  }
}

export const eventBus = new TypedBus();
