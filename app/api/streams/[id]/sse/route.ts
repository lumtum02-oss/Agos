import type { NextRequest } from 'next/server';
import { env } from '@/server/config/env';
import { streamService } from '@/server/service/stream.service';
import { calcEarned, formatUsdc } from '@/server/service/earned';
import { eventBus } from '@/server/lib/eventBus';
import { logger } from '@/server/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Get stream without auth for SSE (public stream data)
  let stream: Awaited<ReturnType<typeof streamService.getStreamPublic>>;
  try {
    stream = await streamService.getStreamPublic(id);
  } catch {
    return new Response('Stream not found', { status: 404 });
  }

  const encoder = new TextEncoder();
  const controller = new AbortController();

  req.signal.addEventListener('abort', () => controller.abort());

  const readable = new ReadableStream({
    start(ctrl) {
      function send(data: unknown) {
        try {
          ctrl.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          controller.abort();
        }
      }

      // Send initial state
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

      send({
        type: 'snapshot',
        streamId: id,
        status: stream.status,
        ratePerSecondMinor: stream.ratePerSecondMinor,
        fundedAmountMinor: stream.fundedAmountMinor,
        withdrawnAmountMinor: stream.withdrawnAmountMinor,
        startedAt: stream.startedAt.toISOString(),
        earned: earned
          ? {
              earnedMinor: earned.earnedMinor.toString(),
              netEarnedMinor: earned.netEarnedMinor.toString(),
              earnedUsdc: formatUsdc(earned.earnedMinor),
              netEarnedUsdc: formatUsdc(earned.netEarnedMinor),
              elapsedSeconds: earned.elapsedSeconds,
              percentComplete: earned.percentComplete,
            }
          : null,
        serverTime: now.toISOString(),
      });

      // Heartbeat to keep connection alive
      const heartbeat = setInterval(() => {
        if (controller.signal.aborted) {
          clearInterval(heartbeat);
          return;
        }
        try {
          ctrl.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch {
          clearInterval(heartbeat);
        }
      }, env.SSE_HEARTBEAT_MS);

      // Per-second tick with earned calculation
      const tick = setInterval(() => {
        if (controller.signal.aborted || stream.status !== 'active') {
          clearInterval(tick);
          return;
        }
        const tickNow = new Date();
        const tickEarned = calcEarned({
          ratePerSecondMinor: stream.ratePerSecondMinor,
          fundedAmountMinor: stream.fundedAmountMinor,
          withdrawnAmountMinor: stream.withdrawnAmountMinor,
          startedAt: stream.startedAt,
          now: tickNow,
        });
        send({
          type: 'tick',
          streamId: id,
          earned: {
            earnedMinor: tickEarned.earnedMinor.toString(),
            netEarnedMinor: tickEarned.netEarnedMinor.toString(),
            earnedUsdc: formatUsdc(tickEarned.earnedMinor),
            netEarnedUsdc: formatUsdc(tickEarned.netEarnedMinor),
            elapsedSeconds: tickEarned.elapsedSeconds,
            percentComplete: tickEarned.percentComplete,
          },
          serverTime: tickNow.toISOString(),
        });
      }, 1000);

      // Subscribe to stream updates
      const unsub = eventBus.subscribe(
        'stream.updated',
        (event) => {
          if (event.streamId !== id) return;
          // Reload stream state on update
          stream.status = event.status as typeof stream.status;
          stream.withdrawnAmountMinor = event.withdrawnAmountMinor;
          send({ type: 'stream.updated', ...event, occurredAt: event.occurredAt.toISOString() });
          if (event.status !== 'active') {
            clearInterval(tick);
          }
        },
        controller.signal,
      );

      const unsubWithdraw = eventBus.subscribe(
        'stream.withdrawn',
        (event) => {
          if (event.streamId !== id) return;
          stream.withdrawnAmountMinor = (
            BigInt(stream.withdrawnAmountMinor) + BigInt(event.amountMinor)
          ).toString();
          send({ type: 'stream.withdrawn', ...event, occurredAt: event.occurredAt.toISOString() });
        },
        controller.signal,
      );

      controller.signal.addEventListener('abort', () => {
        clearInterval(heartbeat);
        clearInterval(tick);
        unsub();
        unsubWithdraw();
        try {
          ctrl.close();
        } catch {
          // already closed
        }
        logger.debug('sse.disconnected', { streamId: id });
      });
    },
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
