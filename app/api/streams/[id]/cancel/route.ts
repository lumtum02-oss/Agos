export const dynamic = 'force-dynamic';
// Cancel/stop invokes the Soroban contract on-chain (with RPC retries).
export const maxDuration = 60;

import type { NextRequest } from 'next/server';
import { compose } from '@/server/middleware/compose';
import { withAuth } from '@/server/middleware/withAuth';
import { withError } from '@/server/middleware/withError';
import { ok } from '@/server/lib/http';
import type { HandlerContext } from '@/server/middleware/compose';
import { streamService } from '@/server/service/stream.service';

async function cancelStream(req: NextRequest, ctx: HandlerContext) {
  const params = await ctx.params;
  const id = params?.id as string;
  const publicKey = ctx.publicKey as string;
  const result = await streamService.cancelStream(id, publicKey, new Date());
  return ok(result);
}

export const POST = compose(withError, withAuth)(cancelStream);
