import { pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { streams } from './streams';

export const WITHDRAWAL_STATUSES = ['pending', 'submitted', 'confirmed', 'failed'] as const;
export type WithdrawalStatus = (typeof WITHDRAWAL_STATUSES)[number];
export const withdrawalStatusEnum = pgEnum('withdrawal_status', WITHDRAWAL_STATUSES);

export const streamWithdrawals = pgTable('stream_withdrawals', {
  id: uuid('id').defaultRandom().primaryKey(),
  streamId: uuid('stream_id')
    .notNull()
    .references(() => streams.id, { onDelete: 'cascade' }),
  employeePubkey: text('employee_pubkey').notNull(),
  amountMinor: text('amount_minor').notNull(),
  txHash: text('tx_hash'),
  status: withdrawalStatusEnum('status').notNull().default('pending'),
  requestedAt: timestamp('requested_at', { withTimezone: true }).defaultNow().notNull(),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  errorMessage: text('error_message'),
});

export type StreamWithdrawal = typeof streamWithdrawals.$inferSelect;
export type NewStreamWithdrawal = typeof streamWithdrawals.$inferInsert;
