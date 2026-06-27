export const dynamic = 'force-dynamic';

import type { NextRequest } from 'next/server';
import { compose } from '@/server/middleware/compose';
import { withError } from '@/server/middleware/withError';
import { ok } from '@/server/lib/http';
import type { HandlerContext } from '@/server/middleware/compose';
import { streamService } from '@/server/service/stream.service';
import { calcEarned, formatUsdc } from '@/server/service/earned';

async function getStream(req: NextRequest, ctx: HandlerContext) {
  const params = await ctx.params;
  const id = params?.id as string;
  // Public endpoint: anyone can view a stream by ID
  const stream = await streamService.getStreamPublic(id);

  const now = new Date();
  const earned =
    stream.status === 'active'
      ? calcEarned({
          ratePerSecondMinor: stream.ratePerSecondMinor,
          fundedAmountMinor: stream.fundedAmountMinor,
          withdrawnAmountMinor: stream.withdrawnAmountMinor,
          startedAt: stream.startedAt,
          now,
        })
      : null;

  return ok({
    stream,
    earned: earned
      ? {
          earnedMinor: earned.earnedMinor.toString(),
          netEarnedMinor: earned.netEarnedMinor.toString(),
          withdrawnMinor: earned.withdrawnMinor.toString(),
          fundedMinor: earned.fundedMinor.toString(),
          remainingMinor: earned.remainingMinor.toString(),
          elapsedSeconds: earned.elapsedSeconds,
          percentComplete: earned.percentComplete,
          earnedUsdc: formatUsdc(earned.earnedMinor),
          netEarnedUsdc: formatUsdc(earned.netEarnedMinor),
        }
      : null,
    now: now.toISOString(),
  });
}

export const GET = compose(withError)(getStream);
