export const dynamic = 'force-dynamic';

import type { NextRequest } from 'next/server';
import { compose } from '@/server/middleware/compose';
import { withError } from '@/server/middleware/withError';
import { ok } from '@/server/lib/http';
import { statsService } from '@/server/service/stats.service';

async function getStats(_req: NextRequest) {
  const stats = await statsService.getPublicStats();
  return ok(stats);
}

export const GET = compose(withError)(getStats);
