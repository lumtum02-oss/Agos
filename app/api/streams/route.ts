export const dynamic = 'force-dynamic';
// XLM stream creation funds the Soroban contract on-chain (build/sign/submit/poll
// with retries for transient testnet-RPC faults); give it room past the default.
export const maxDuration = 60;

import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { compose } from '@/server/middleware/compose';
import { withAuth } from '@/server/middleware/withAuth';
import { withError } from '@/server/middleware/withError';
import { ok, created } from '@/server/lib/http';
import type { HandlerContext } from '@/server/middleware/compose';
import { streamService } from '@/server/service/stream.service';
import { ensureBootstrap } from '@/server/lib/bootstrap';

const createStreamSchema = z.object({
  employeePubkey: z.string().min(1),
  employeeName: z.string().min(1).max(60),
  title: z.string().min(1).max(80),
  asset: z.enum(['XLM', 'USDC']).default('XLM'),
  ratePerSecondMinor: z.string().min(1),
  fundedAmountMinor: z.string().min(1),
});

async function listStreams(_req: NextRequest, ctx: HandlerContext) {
  ensureBootstrap();
  const publicKey = ctx.publicKey as string;
  const streams = await streamService.getStreamsByEmployer(publicKey);
  const stats = await streamService.getStreamStats(publicKey);
  return ok({ streams, stats });
}

async function createStream(req: NextRequest, ctx: HandlerContext) {
  ensureBootstrap();
  const publicKey = ctx.publicKey as string;
  const body = createStreamSchema.parse(await req.json());
  const stream = await streamService.createStream(publicKey, body);
  return created(stream);
}

export const GET = compose(withError, withAuth)(listStreams);
export const POST = compose(withError, withAuth)(createStream);
