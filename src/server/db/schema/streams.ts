import { boolean, index, integer, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const STREAM_STATUSES = ['active', 'cancelled', 'completed', 'paused'] as const;
export type StreamStatus = (typeof STREAM_STATUSES)[number];
export const streamStatusEnum = pgEnum('stream_status', STREAM_STATUSES);

export const ASSET_KINDS = ['XLM', 'USDC'] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];
export const assetKindEnum = pgEnum('asset_kind', ASSET_KINDS);

export const streams = pgTable(
  'streams',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    employerPubkey: text('employer_pubkey').notNull(),
    employeePubkey: text('employee_pubkey').notNull(),
    employeeName: text('employee_name').notNull(),
    title: text('title').notNull(),
    asset: assetKindEnum('asset').notNull().default('XLM'),
    ratePerSecondMinor: text('rate_per_second_minor').notNull(), // 6-decimal minor units/sec
    fundedAmountMinor: text('funded_amount_minor').notNull(), // total deposited (minor units)
    withdrawnAmountMinor: text('withdrawn_amount_minor').notNull().default('0'),
    isDemo: boolean('is_demo').notNull().default(false),
    // AgosStream Soroban contract wiring (XLM streams). Null for USDC / legacy streams.
    contractStreamId: text('contract_stream_id'),
    createTxHash: text('create_tx_hash'),
    status: streamStatusEnum('status').notNull().default('active'),
    version: integer('version').notNull().default(0),
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    lastWithdrawTxHash: text('last_withdraw_tx_hash'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    employerIdx: index('streams_employer_idx').on(t.employerPubkey),
    employeeIdx: index('streams_employee_idx').on(t.employeePubkey),
    statusIdx: index('streams_status_idx').on(t.status),
  }),
);

export type Stream = typeof streams.$inferSelect;
export type NewStream = typeof streams.$inferInsert;
