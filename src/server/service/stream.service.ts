import { eq } from 'drizzle-orm';
import { StrKey } from '@stellar/stellar-sdk';
import { env } from '@/server/config/env';
import { db } from '@/server/db/client';
import { streams, streamWithdrawals } from '@/server/db/schema';
import type { AssetKind, Stream } from '@/server/db/schema';
import { AppError } from '@/server/lib/http';
import { logger } from '@/server/lib/logger';
import { eventBus } from '@/server/lib/eventBus';
import { calcEarned, formatAmount } from './earned';

export type CreateStreamInput = {
  employeePubkey: string;
  employeeName: string;
  title: string;
  asset?: AssetKind;
  ratePerSecondMinor: string;
  fundedAmountMinor: string;
};

export const streamService = {
  async createStream(employerPubkey: string, data: CreateStreamInput): Promise<Stream> {
    if (!StrKey.isValidEd25519PublicKey(data.employeePubkey)) {
      throw new AppError('INVALID_PUBLIC_KEY', 'Employee public key is invalid', 400);
    }
    if (!data.employeeName.trim()) {
      throw new AppError('INVALID_INPUT', 'Employee name is required', 400);
    }
    if (!data.title.trim()) {
      throw new AppError('INVALID_INPUT', 'Stream title is required', 400);
    }
    const rate = BigInt(data.ratePerSecondMinor);
    const funded = BigInt(data.fundedAmountMinor);
    if (rate <= 0n) {
      throw new AppError('INVALID_INPUT', 'Rate per second must be positive', 400);
    }
    if (funded <= 0n) {
      throw new AppError('INVALID_INPUT', 'Funded amount must be positive', 400);
    }

    const asset: AssetKind = data.asset === 'USDC' ? 'USDC' : 'XLM';

    // XLM streams are funded into and settled by the AgosStream Soroban contract.
    // The hub (= contract admin/payer) deposits the full grant on-chain; vesting
    // is then computed on-chain from ledger time. USDC streams keep the classic
    // hub-payout path (USDC opt-in / trustline).
    let contractStreamId: string | null = null;
    let createTxHash: string | null = null;
    let startedAt: Date | undefined;

    if (asset === 'XLM' && !env.DEMO_MODE) {
      const { sorobanEnabled, sorobanStream } = await import('@/server/stellar/soroban');
      if (sorobanEnabled()) {
        // duration so the schedule matches the off-chain drip rate exactly:
        // duration = funded / ratePerSecond (seconds), minimum 1s.
        let durationSeconds = Number(funded / rate);
        if (!Number.isFinite(durationSeconds) || durationSeconds < 1) durationSeconds = 1;
        const startTime = Math.floor(Date.now() / 1000);
        const endTime = startTime + durationSeconds;
        // DB minor units are 6-decimal; the native XLM SAC uses 7 decimals (stroops).
        const totalStroops = funded * 10n;
        try {
          const res = await sorobanStream.createStream({
            payer: env.HUB_STELLAR_SECRET
              ? (await import('@stellar/stellar-sdk')).Keypair.fromSecret(
                  env.HUB_STELLAR_SECRET,
                ).publicKey()
              : employerPubkey,
            recipient: data.employeePubkey,
            totalStroops,
            startTime,
            endTime,
          });
          contractStreamId = res.streamId;
          createTxHash = res.txHash;
          startedAt = new Date(startTime * 1000);
          logger.info('stream.contract.created', {
            contractStreamId,
            createTxHash,
            totalStroops: totalStroops.toString(),
          });
        } catch (err) {
          logger.error('stream.contract.create_failed', { err: String(err) });
          throw new AppError(
            'INTERNAL',
            'Could not fund the stream on-chain. Ensure the hub wallet holds enough testnet XLM, then retry.',
            502,
          );
        }
      }
    }

    const [stream] = await db
      .insert(streams)
      .values({
        employerPubkey,
        employeePubkey: data.employeePubkey,
        employeeName: data.employeeName.trim(),
        title: data.title.trim(),
        asset,
        ratePerSecondMinor: data.ratePerSecondMinor,
        fundedAmountMinor: data.fundedAmountMinor,
        withdrawnAmountMinor: '0',
        contractStreamId,
        createTxHash,
        ...(startedAt ? { startedAt } : {}),
        status: 'active',
      })
      .returning();

    logger.info('stream.created', {
      streamId: stream.id,
      employer: logger.pubkey(employerPubkey),
      employee: logger.pubkey(data.employeePubkey),
      ratePerSecondMinor: data.ratePerSecondMinor,
      fundedAmountMinor: data.fundedAmountMinor,
      contractStreamId,
    });

    return stream;
  },

  async getStreamsByEmployer(employerPubkey: string): Promise<Stream[]> {
    return db.select().from(streams).where(eq(streams.employerPubkey, employerPubkey));
  },

  async getStreamsByEmployee(employeePubkey: string): Promise<Stream[]> {
    return db.select().from(streams).where(eq(streams.employeePubkey, employeePubkey));
  },

  async getStream(id: string, callerPubkey: string): Promise<Stream> {
    const [stream] = await db.select().from(streams).where(eq(streams.id, id)).limit(1);
    if (!stream) {
      throw new AppError('NOT_FOUND', 'Stream not found', 404);
    }
    if (stream.employerPubkey !== callerPubkey && stream.employeePubkey !== callerPubkey) {
      throw new AppError('FORBIDDEN', 'Not authorized to view this stream', 403);
    }
    return stream;
  },

  async getStreamPublic(id: string): Promise<Stream> {
    const [stream] = await db.select().from(streams).where(eq(streams.id, id)).limit(1);
    if (!stream) {
      throw new AppError('NOT_FOUND', 'Stream not found', 404);
    }
    return stream;
  },

  async withdrawEarned(streamId: string, employeePubkey: string, now: Date): Promise<{
    txHash: string | null;
    amountMinor: string;
    status: string;
  }> {
    const [stream] = await db.select().from(streams).where(eq(streams.id, streamId)).limit(1);
    if (!stream) {
      throw new AppError('NOT_FOUND', 'Stream not found', 404);
    }
    if (stream.employeePubkey !== employeePubkey) {
      throw new AppError('FORBIDDEN', 'Only the employee can withdraw', 403);
    }
    if (stream.status !== 'active') {
      throw new AppError('CONFLICT', `Cannot withdraw from a ${stream.status} stream`, 409);
    }

    const earned = calcEarned({
      ratePerSecondMinor: stream.ratePerSecondMinor,
      fundedAmountMinor: stream.fundedAmountMinor,
      withdrawnAmountMinor: stream.withdrawnAmountMinor,
      startedAt: stream.startedAt,
      now,
    });

    // --- Contract path: XLM streams settle through the AgosStream contract. ---
    if (stream.contractStreamId && !env.DEMO_MODE) {
      const { sorobanStream } = await import('@/server/stellar/soroban');
      // The contract is the source of truth for what has vested.
      const withdrawableStroops = await sorobanStream.withdrawable(stream.contractStreamId);
      if (withdrawableStroops <= 0n) {
        throw new AppError('CONFLICT', 'No earned amount available to withdraw yet', 409);
      }
      let txHash: string;
      let paidStroops: bigint;
      try {
        const res = await sorobanStream.withdraw(stream.contractStreamId);
        txHash = res.txHash;
        paidStroops = res.amountStroops;
      } catch (err) {
        logger.error('stream.withdraw.contract_failed', { streamId, err: String(err) });
        throw new AppError('INTERNAL', 'On-chain withdrawal failed. Please retry.', 502);
      }
      // stroops (7-dec) -> minor (6-dec)
      const paidMinor = paidStroops / 10n;
      const amountMinor = paidMinor.toString();

      const [withdrawal] = await db
        .insert(streamWithdrawals)
        .values({
          streamId,
          employeePubkey,
          amountMinor,
          txHash,
          status: 'confirmed',
          confirmedAt: new Date(),
        })
        .returning();

      const newWithdrawn = (BigInt(stream.withdrawnAmountMinor) + paidMinor).toString();
      const newVersion = stream.version + 1;
      const newStatus: Stream['status'] =
        BigInt(newWithdrawn) >= BigInt(stream.fundedAmountMinor) ? 'completed' : 'active';

      await db
        .update(streams)
        .set({
          withdrawnAmountMinor: newWithdrawn,
          lastWithdrawTxHash: txHash,
          version: newVersion,
          status: newStatus,
          completedAt: newStatus === 'completed' ? new Date() : undefined,
          updatedAt: new Date(),
        })
        .where(eq(streams.id, streamId));

      eventBus.publish('stream.withdrawn', {
        streamId,
        withdrawalId: withdrawal.id,
        amountMinor,
        txHash,
        status: 'confirmed',
        occurredAt: new Date(),
      });

      logger.info('stream.withdraw.contract_confirmed', { streamId, txHash, amountMinor });
      return { txHash, amountMinor, status: 'confirmed' };
    }

    if (earned.netEarnedMinor <= 0n) {
      throw new AppError('CONFLICT', 'No earned amount available to withdraw', 409);
    }

    const amountMinor = earned.netEarnedMinor.toString();
    const amount = formatAmount(earned.netEarnedMinor);

    let txHash: string | null = null;
    let status = 'submitted';

    // Real on-chain payout from the hub wallet (legacy XLM / USDC if opted in).
    if (env.HUB_STELLAR_SECRET && !env.DEMO_MODE) {
      try {
        const { sendAssetPayment } = await import('@/server/stellar/tx');
        txHash = await sendAssetPayment({
          fromSecret: env.HUB_STELLAR_SECRET,
          toPublicKey: employeePubkey,
          asset: stream.asset,
          amount,
          memo: `agos-wd-${streamId.slice(0, 8)}`,
        });
        status = 'confirmed';
        logger.info('stream.withdraw.confirmed', { streamId, txHash, amount, asset: stream.asset });
      } catch (err) {
        const msg = String(err);
        logger.error('stream.withdraw.tx_failed', { streamId, err: msg });
        if (stream.asset === 'USDC' && /op_no_trust|no_trust/i.test(msg)) {
          throw new AppError(
            'CONFLICT',
            'Recipient has no USDC trustline. Use "Enable USDC" on the recipient wallet, or use an XLM stream.',
            409,
          );
        }
        throw new AppError('INTERNAL', 'On-chain payout failed. Please retry.', 502);
      }
    } else {
      // Demo mode only (never enabled in production).
      txHash = `demo-tx-${Date.now().toString(16)}`;
      status = 'confirmed';
      logger.info('stream.withdraw.demo', { streamId, amount, txHash });
    }

    // Record withdrawal
    const [withdrawal] = await db
      .insert(streamWithdrawals)
      .values({
        streamId,
        employeePubkey,
        amountMinor,
        txHash,
        status: status as 'pending' | 'submitted' | 'confirmed' | 'failed',
        confirmedAt: status === 'confirmed' ? new Date() : undefined,
      })
      .returning();

    // Update stream
    const newWithdrawn = (BigInt(stream.withdrawnAmountMinor) + earned.netEarnedMinor).toString();
    const newVersion = stream.version + 1;
    let newStatus: Stream['status'] = 'active';

    // If fully paid out, mark complete
    if (BigInt(newWithdrawn) >= BigInt(stream.fundedAmountMinor)) {
      newStatus = 'completed';
    }

    await db
      .update(streams)
      .set({
        withdrawnAmountMinor: newWithdrawn,
        lastWithdrawTxHash: txHash,
        version: newVersion,
        status: newStatus,
        completedAt: newStatus === 'completed' ? new Date() : undefined,
        updatedAt: new Date(),
      })
      .where(eq(streams.id, streamId));

    eventBus.publish('stream.withdrawn', {
      streamId,
      withdrawalId: withdrawal.id,
      amountMinor,
      txHash,
      status,
      occurredAt: new Date(),
    });

    return { txHash, amountMinor, status };
  },

  async cancelStream(streamId: string, employerPubkey: string, now: Date): Promise<{
    refundAmountMinor: string;
    txHash: string | null;
  }> {
    const [stream] = await db.select().from(streams).where(eq(streams.id, streamId)).limit(1);
    if (!stream) {
      throw new AppError('NOT_FOUND', 'Stream not found', 404);
    }
    if (stream.employerPubkey !== employerPubkey) {
      throw new AppError('FORBIDDEN', 'Only the employer can cancel', 403);
    }
    if (stream.status !== 'active') {
      throw new AppError('CONFLICT', `Cannot cancel a ${stream.status} stream`, 409);
    }

    const earned = calcEarned({
      ratePerSecondMinor: stream.ratePerSecondMinor,
      fundedAmountMinor: stream.fundedAmountMinor,
      withdrawnAmountMinor: stream.withdrawnAmountMinor,
      startedAt: stream.startedAt,
      now,
    });

    let refundMinor = earned.remainingMinor;
    let txHash: string | null = null;

    // --- Contract path: stop the on-chain stream (settle vested + reclaim). ---
    if (stream.contractStreamId && !env.DEMO_MODE) {
      const { sorobanStream } = await import('@/server/stellar/soroban');
      try {
        const res = await sorobanStream.stop(stream.contractStreamId);
        txHash = res.txHash;
        refundMinor = res.reclaimStroops / 10n; // stroops -> minor
        logger.info('stream.cancel.contract_stopped', {
          streamId,
          txHash,
          reclaimMinor: refundMinor.toString(),
        });
      } catch (err) {
        logger.error('stream.cancel.contract_failed', { streamId, err: String(err) });
        throw new AppError('INTERNAL', 'On-chain stop failed. Please retry.', 502);
      }

      await db
        .update(streams)
        .set({
          status: 'cancelled',
          cancelledAt: now,
          lastWithdrawTxHash: txHash,
          version: stream.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(streams.id, streamId));

      eventBus.publish('stream.updated', {
        streamId,
        version: stream.version + 1,
        status: 'cancelled',
        withdrawnAmountMinor: stream.withdrawnAmountMinor,
        occurredAt: new Date(),
      });

      logger.info('stream.cancelled', {
        streamId,
        employer: logger.pubkey(employerPubkey),
        refundAmountMinor: refundMinor.toString(),
      });

      return { refundAmountMinor: refundMinor.toString(), txHash };
    }

    const refundAmountMinor = refundMinor.toString();
    const refundAmount = formatAmount(refundMinor);

    // Refund unearned remainder to employer on-chain (legacy / USDC streams).
    if (refundMinor > 0n && env.HUB_STELLAR_SECRET && !env.DEMO_MODE) {
      try {
        const { sendAssetPayment } = await import('@/server/stellar/tx');
        txHash = await sendAssetPayment({
          fromSecret: env.HUB_STELLAR_SECRET,
          toPublicKey: employerPubkey,
          asset: stream.asset,
          amount: refundAmount,
          memo: `agos-rf-${streamId.slice(0, 8)}`,
        });
        logger.info('stream.cancel.refund_confirmed', { streamId, txHash, refundAmount });
      } catch (err) {
        logger.error('stream.cancel.refund_failed', { streamId, err: String(err) });
      }
    } else if (refundMinor > 0n && env.DEMO_MODE) {
      txHash = `demo-refund-${Date.now().toString(16)}`;
      logger.info('stream.cancel.demo_refund', { streamId, refundAmount, txHash });
    }

    await db
      .update(streams)
      .set({
        status: 'cancelled',
        cancelledAt: now,
        version: stream.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(streams.id, streamId));

    eventBus.publish('stream.updated', {
      streamId,
      version: stream.version + 1,
      status: 'cancelled',
      withdrawnAmountMinor: stream.withdrawnAmountMinor,
      occurredAt: new Date(),
    });

    logger.info('stream.cancelled', {
      streamId,
      employer: logger.pubkey(employerPubkey),
      refundAmountMinor,
    });

    return { refundAmountMinor, txHash };
  },

  async getStreamStats(employerPubkey: string): Promise<{
    totalStreams: number;
    activeStreams: number;
    totalPaidOutMinor: string;
  }> {
    const allStreams = await db
      .select()
      .from(streams)
      .where(eq(streams.employerPubkey, employerPubkey));

    const totalStreams = allStreams.length;
    const activeStreams = allStreams.filter((s) => s.status === 'active').length;
    const totalPaidOutMinor = allStreams
      .reduce((acc, s) => acc + BigInt(s.withdrawnAmountMinor), 0n)
      .toString();

    return { totalStreams, activeStreams, totalPaidOutMinor };
  },
};
