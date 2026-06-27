import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { sessions, streams, streamWithdrawals } from '@/server/db/schema';

export type PublicStats = {
  uniqueWallets: number;
  logins: number;
  totalStreams: number;
  activeStreams: number;
  withdrawals: number;
  totalStreamedMinor: string;
  byAsset: { XLM: number; USDC: number };
};

/**
 * Real interaction counts for the public /stats page.
 * Demo/seed streams (is_demo = true) are excluded from every count.
 * Wallet + login counts come from real SEP-10 sessions.
 */
export const statsService = {
  async getPublicStats(): Promise<PublicStats> {
    const [walletRow] = await db
      .select({
        unique: sql<number>`count(distinct ${sessions.publicKey})`,
        total: sql<number>`count(*)`,
      })
      .from(sessions);

    const [streamRow] = await db
      .select({
        total: sql<number>`count(*)`,
        active: sql<number>`count(*) filter (where ${streams.status} = 'active')`,
        xlm: sql<number>`count(*) filter (where ${streams.asset} = 'XLM')`,
        usdc: sql<number>`count(*) filter (where ${streams.asset} = 'USDC')`,
        streamed: sql<string>`coalesce(sum(${streams.withdrawnAmountMinor}::numeric), 0)::text`,
      })
      .from(streams)
      .where(eq(streams.isDemo, false));

    const [wdRow] = await db
      .select({ total: sql<number>`count(*)` })
      .from(streamWithdrawals)
      .innerJoin(streams, eq(streamWithdrawals.streamId, streams.id))
      .where(and(eq(streams.isDemo, false), eq(streamWithdrawals.status, 'confirmed')));

    return {
      uniqueWallets: Number(walletRow?.unique ?? 0),
      logins: Number(walletRow?.total ?? 0),
      totalStreams: Number(streamRow?.total ?? 0),
      activeStreams: Number(streamRow?.active ?? 0),
      withdrawals: Number(wdRow?.total ?? 0),
      totalStreamedMinor: String(streamRow?.streamed ?? '0'),
      byAsset: { XLM: Number(streamRow?.xlm ?? 0), USDC: Number(streamRow?.usdc ?? 0) },
    };
  },
};
