import { lt } from 'drizzle-orm';
import { env } from '@/server/config/env';
import { db } from '@/server/db/client';
import { authNonces } from '@/server/db/schema/authNonces';
import { logger } from '@/server/lib/logger';

/**
 * Bootstrap tasks for Agos:
 *   - Nonce expiry sweeper: deletes expired auth nonces every minute.
 */

const globalForBootstrap = globalThis as unknown as { agosBootstrapStarted?: boolean };
const handles: { stop: () => void }[] = [];

function startNonceSweeper(): () => void {
  const timer = setInterval(() => {
    db.delete(authNonces)
      .where(lt(authNonces.expiresAt, new Date()))
      .then((r) => {
        const count = r.rowCount ?? 0;
        if (count) logger.info('bootstrap.swept_nonces', { count });
      })
      .catch((err) => logger.error('bootstrap.sweeper_error', { err: String(err) }));
  }, 60_000);
  timer.unref?.();
  return () => clearInterval(timer);
}

export function ensureBootstrap(): void {
  // Serverless-safe: never start setInterval timers unless explicitly enabled.
  // Streamed amounts are computed on read (calcEarned), so no server timer is needed.
  if (process.env.ENABLE_BACKGROUND_JOBS !== 'true') return;
  if (globalForBootstrap.agosBootstrapStarted) return;
  if (env.NODE_ENV === 'test') return;
  handles.push({ stop: startNonceSweeper() });
  globalForBootstrap.agosBootstrapStarted = true;
  logger.info('bootstrap.started');
}

export function stopBootstrap(): void {
  for (const h of handles) h.stop();
  handles.length = 0;
  globalForBootstrap.agosBootstrapStarted = false;
  logger.info('bootstrap.stopped');
}
