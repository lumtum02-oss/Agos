/**
 * Seed local DEMO data for Agos (development only).
 *
 * Inserts a few generic, clearly-labelled demo streams under one demo employer
 * key, all flagged `isDemo: true` so they are EXCLUDED from /api/stats and never
 * counted as real activity. No fabricated persons — labels are neutral roles.
 *
 * Usage: pnpm seed   (reads .env.local via dotenv)
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { eq } from 'drizzle-orm';
import { streams, streamWithdrawals } from '../src/server/db/schema';

const DATABASE_URL =
  process.env.DRIZZLE_DATABASE_URL ??
  process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/stellar_agent_d';

const pool = new Pool({ connectionString: DATABASE_URL });
const db = drizzle(pool);

// Demo employer + recipient keys (valid testnet-format public keys, no persons).
const EMPLOYER_PUBKEY = 'GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGZLZZ7BXBZM3KM5KQ7VG6Y';
const RECIPIENT_A = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
const RECIPIENT_B = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN';
const RECIPIENT_C = 'GAHTJRC4A62IYXL5RNXPBLUMXHFQV6GO5PTEBFQUNZCCG4YJRNTNJMU';

const RATE = '249'; // ~0.000249 XLM/sec

async function seed() {
  console.log('Seeding Agos DEMO data (isDemo: true, excluded from stats)...');
  console.log(`Database: ${DATABASE_URL.replace(/:[^@]+@/, ':***@')}`);

  await db.delete(streams).where(eq(streams.employerPubkey, EMPLOYER_PUBKEY));
  console.log('Cleared existing demo streams for demo employer');

  const now = new Date();

  const a = await db
    .insert(streams)
    .values({
      employerPubkey: EMPLOYER_PUBKEY,
      employeePubkey: RECIPIENT_A,
      employeeName: 'Backend retainer',
      title: 'Backend development',
      asset: 'XLM',
      ratePerSecondMinor: RATE,
      fundedAmountMinor: '312000000',
      withdrawnAmountMinor: '0',
      status: 'active',
      isDemo: true,
      startedAt: new Date(now.getTime() - 18 * 3600 * 1000),
    })
    .returning();
  console.log(`Created demo stream A: ${a[0].id}`);

  await db
    .insert(streams)
    .values({
      employerPubkey: EMPLOYER_PUBKEY,
      employeePubkey: RECIPIENT_B,
      employeeName: 'Design retainer',
      title: 'UI/UX design',
      asset: 'XLM',
      ratePerSecondMinor: RATE,
      fundedAmountMinor: '312000000',
      withdrawnAmountMinor: '0',
      status: 'active',
      isDemo: true,
      startedAt: new Date(now.getTime() - 6 * 3600 * 1000),
    })
    .returning();

  await db
    .insert(streams)
    .values({
      employerPubkey: EMPLOYER_PUBKEY,
      employeePubkey: RECIPIENT_C,
      employeeName: 'Mobile retainer',
      title: 'Mobile app development',
      asset: 'XLM',
      ratePerSecondMinor: '119',
      fundedAmountMinor: '100000000',
      withdrawnAmountMinor: '100000000',
      status: 'completed',
      isDemo: true,
      startedAt: new Date(now.getTime() - 10 * 24 * 3600 * 1000),
      completedAt: new Date(now.getTime() - 24 * 3600 * 1000),
    })
    .returning();

  console.log('Seed complete (3 demo streams, all isDemo: true).');
  await pool.end();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
