import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the db module
const mockDbChain = {
  select: vi.fn(),
  from: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
  insert: vi.fn(),
  values: vi.fn(),
  returning: vi.fn(),
  update: vi.fn(),
  set: vi.fn(),
};

vi.mock('@/server/db/client', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('@/server/lib/eventBus', () => ({
  eventBus: { publish: vi.fn() },
}));

vi.mock('@/server/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    pubkey: (k: string) => k?.slice(0, 8) ?? '<none>',
  },
}));

vi.mock('@/server/config/env', () => ({
  env: {
    NODE_ENV: 'test',
    HUB_STELLAR_SECRET: undefined,
    DEMO_MODE: true,
    DRIZZLE_DATABASE_URL: 'postgres://test:test@localhost/test',
    SESSION_SECRET: 'test-session-secret-at-least-32-characters',
    SESSION_COOKIE_NAME: 'agos_session',
    SESSION_TTL_SECONDS: 604800,
    NONCE_TTL_SECONDS: 300,
    STELLAR_NETWORK: 'testnet',
    STELLAR_HORIZON_URL: 'https://horizon-testnet.stellar.org',
    STELLAR_NETWORK_PASSPHRASE: 'Test SDF Network ; September 2015',
    USDC_ASSET_CODE: 'USDC',
    USDC_ASSET_ISSUER_TESTNET: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
    USDC_ASSET_ISSUER_PUBLIC: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
    SSE_HEARTBEAT_MS: 15000,
    NEXT_PUBLIC_APP_NAME: 'Agos',
    NEXT_PUBLIC_APP_URL: 'http://localhost:3004',
    NEXT_PUBLIC_SUPPORTED_LOCALES: 'en',
    NEXT_PUBLIC_DEFAULT_LOCALE: 'en',
    NEXT_PUBLIC_LOCALE_PREFIX: 'as-needed',
  },
  USDC_ASSET_ISSUER_VALUE: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
}));

import { streamService } from '@/server/service/stream.service';
import { AppError } from '@/server/lib/http';
import { db } from '@/server/db/client';

const VALID_EMPLOYER = 'GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGZLZZ7BXBZM3KM5KQ7VG6Y';
const VALID_EMPLOYEE = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
const OTHER_KEY = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN';

// Reusable mock stream factory
function makeStream(overrides = {}) {
  return {
    id: 'stream-uuid-001',
    employerPubkey: VALID_EMPLOYER,
    employeePubkey: VALID_EMPLOYEE,
    employeeName: 'Rafi Ananda',
    title: 'Backend Development',
    ratePerSecondMinor: '119',
    fundedAmountMinor: '1000000000', // 1000 USDC
    withdrawnAmountMinor: '0',
    status: 'active',
    version: 0,
    startedAt: new Date(Date.now() - 7200_000), // 2h ago
    createdAt: new Date(),
    updatedAt: new Date(),
    cancelledAt: null,
    completedAt: null,
    lastWithdrawTxHash: null,
    ...overrides,
  };
}

function makeSelectChain(result: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(result),
  };
  vi.mocked(db.select).mockReturnValue(chain as never);
  return chain;
}

function makeSelectChainNoLimit(result: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(result),
  };
  vi.mocked(db.select).mockReturnValue(chain as never);
  return chain;
}

function makeInsertChain(result: unknown[]) {
  const chain = {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(result),
  };
  vi.mocked(db.insert).mockReturnValue(chain as never);
  return chain;
}

function makeUpdateChain() {
  const chain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([]),
  };
  vi.mocked(db.update).mockReturnValue(chain as never);
  return chain;
}

describe('streamService.createStream', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws INVALID_PUBLIC_KEY for invalid employee pubkey', async () => {
    await expect(
      streamService.createStream(VALID_EMPLOYER, {
        employeePubkey: 'not-a-valid-key',
        employeeName: 'Test',
        title: 'Work',
        ratePerSecondMinor: '119',
        fundedAmountMinor: '1000000000',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_PUBLIC_KEY' });
  });

  it('throws INVALID_INPUT for empty employee name', async () => {
    await expect(
      streamService.createStream(VALID_EMPLOYER, {
        employeePubkey: VALID_EMPLOYEE,
        employeeName: '',
        title: 'Work',
        ratePerSecondMinor: '119',
        fundedAmountMinor: '1000000000',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('throws INVALID_INPUT for empty title', async () => {
    await expect(
      streamService.createStream(VALID_EMPLOYER, {
        employeePubkey: VALID_EMPLOYEE,
        employeeName: 'Test Person',
        title: '',
        ratePerSecondMinor: '119',
        fundedAmountMinor: '1000000000',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('throws INVALID_INPUT for zero rate', async () => {
    await expect(
      streamService.createStream(VALID_EMPLOYER, {
        employeePubkey: VALID_EMPLOYEE,
        employeeName: 'Test',
        title: 'Work',
        ratePerSecondMinor: '0',
        fundedAmountMinor: '1000000000',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('throws INVALID_INPUT for zero funded amount', async () => {
    await expect(
      streamService.createStream(VALID_EMPLOYER, {
        employeePubkey: VALID_EMPLOYEE,
        employeeName: 'Test',
        title: 'Work',
        ratePerSecondMinor: '119',
        fundedAmountMinor: '0',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('creates stream successfully with valid data', async () => {
    const mockStream = makeStream();
    makeInsertChain([mockStream]);

    const result = await streamService.createStream(VALID_EMPLOYER, {
      employeePubkey: VALID_EMPLOYEE,
      employeeName: 'Rafi Ananda',
      title: 'Backend Development',
      ratePerSecondMinor: '119',
      fundedAmountMinor: '1000000000',
    });

    expect(result).toEqual(mockStream);
  });
});

describe('streamService.getStream', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws NOT_FOUND for missing stream', async () => {
    makeSelectChain([]);

    await expect(
      streamService.getStream('non-existent-id', VALID_EMPLOYER),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws FORBIDDEN if caller is not employer or employee', async () => {
    makeSelectChain([makeStream()]);

    await expect(
      streamService.getStream('stream-uuid-001', OTHER_KEY),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('returns stream for employer', async () => {
    const mockStream = makeStream();
    makeSelectChain([mockStream]);

    const result = await streamService.getStream('stream-uuid-001', VALID_EMPLOYER);
    expect(result).toEqual(mockStream);
  });

  it('returns stream for employee', async () => {
    const mockStream = makeStream();
    makeSelectChain([mockStream]);

    const result = await streamService.getStream('stream-uuid-001', VALID_EMPLOYEE);
    expect(result).toEqual(mockStream);
  });
});

describe('streamService.withdrawEarned', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws NOT_FOUND for missing stream', async () => {
    makeSelectChain([]);

    await expect(
      streamService.withdrawEarned('non-existent', VALID_EMPLOYEE, new Date()),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws FORBIDDEN if caller is not employee', async () => {
    makeSelectChain([makeStream()]);

    await expect(
      streamService.withdrawEarned('stream-uuid-001', OTHER_KEY, new Date()),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('throws CONFLICT if stream is not active', async () => {
    makeSelectChain([makeStream({ status: 'cancelled' })]);

    await expect(
      streamService.withdrawEarned('stream-uuid-001', VALID_EMPLOYEE, new Date()),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('throws CONFLICT if nothing earned yet', async () => {
    // startedAt = now, so nothing earned
    makeSelectChain([makeStream({ startedAt: new Date() })]);

    await expect(
      streamService.withdrawEarned('stream-uuid-001', VALID_EMPLOYEE, new Date()),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('processes withdrawal in demo mode', async () => {
    // 2h ago, rate 119/s, so ~856800 minor earned
    const mockStream = makeStream();
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([mockStream]),
    };
    vi.mocked(db.select).mockReturnValue(selectChain as never);

    const mockWithdrawal = { id: 'wd-uuid-001', ...mockStream };
    const insertChain = {
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue([mockWithdrawal]),
    };
    vi.mocked(db.insert).mockReturnValue(insertChain as never);
    makeUpdateChain();

    const result = await streamService.withdrawEarned(
      'stream-uuid-001',
      VALID_EMPLOYEE,
      new Date(Date.now()),
    );

    expect(result.amountMinor).toBeTruthy();
    expect(result.status).toBe('confirmed'); // demo mode → confirmed
    expect(result.txHash).toMatch(/^demo-tx-/);
  });
});

describe('streamService.cancelStream', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws NOT_FOUND for missing stream', async () => {
    makeSelectChain([]);

    await expect(
      streamService.cancelStream('non-existent', VALID_EMPLOYER, new Date()),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws FORBIDDEN if caller is not employer', async () => {
    makeSelectChain([makeStream()]);

    await expect(
      streamService.cancelStream('stream-uuid-001', OTHER_KEY, new Date()),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('throws CONFLICT if stream is already cancelled', async () => {
    makeSelectChain([makeStream({ status: 'cancelled' })]);

    await expect(
      streamService.cancelStream('stream-uuid-001', VALID_EMPLOYER, new Date()),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('cancels stream and returns refund amount in demo mode', async () => {
    makeSelectChain([makeStream()]);
    makeUpdateChain();

    const result = await streamService.cancelStream(
      'stream-uuid-001',
      VALID_EMPLOYER,
      new Date(),
    );

    expect(result.refundAmountMinor).toBeTruthy();
    // In demo mode with refund > 0, txHash is a demo refund hash
    expect(result.txHash).toMatch(/^demo-refund-/);
  });
});

describe('streamService.getStreamStats', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns zero stats for employer with no streams', async () => {
    makeSelectChainNoLimit([]);

    const result = await streamService.getStreamStats(VALID_EMPLOYER);
    expect(result.totalStreams).toBe(0);
    expect(result.activeStreams).toBe(0);
    expect(result.totalPaidOutMinor).toBe('0');
  });

  it('counts active and total streams correctly', async () => {
    makeSelectChainNoLimit([
      makeStream({ status: 'active', withdrawnAmountMinor: '1000000' }),
      makeStream({ status: 'active', withdrawnAmountMinor: '2000000' }),
      makeStream({ status: 'cancelled', withdrawnAmountMinor: '500000' }),
    ]);

    const result = await streamService.getStreamStats(VALID_EMPLOYER);
    expect(result.totalStreams).toBe(3);
    expect(result.activeStreams).toBe(2);
    expect(result.totalPaidOutMinor).toBe('3500000');
  });
});

describe('streamService.getStreamsByEmployer', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns all streams for employer', async () => {
    const mockStreams = [makeStream(), makeStream({ id: 'stream-uuid-002' })];
    makeSelectChainNoLimit(mockStreams);

    const result = await streamService.getStreamsByEmployer(VALID_EMPLOYER);
    expect(result).toHaveLength(2);
  });
});
