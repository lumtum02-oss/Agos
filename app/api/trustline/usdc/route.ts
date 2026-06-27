export const dynamic = 'force-dynamic';

import type { NextRequest } from 'next/server';
import { StrKey } from '@stellar/stellar-sdk';
import { z } from 'zod';
import { compose } from '@/server/middleware/compose';
import { withError } from '@/server/middleware/withError';
import { AppError, ok } from '@/server/lib/http';
import { buildUsdcTrustlineXdr, hasUsdcTrustline } from '@/server/stellar/tx';
import { usdcCode, usdcIssuer } from '@/server/stellar/network';

const bodySchema = z.object({ publicKey: z.string().min(1) });

// GET /api/trustline/usdc?publicKey=G... — does the wallet already trust USDC?
async function getStatus(req: NextRequest) {
  const publicKey = req.nextUrl.searchParams.get('publicKey') ?? '';
  if (!StrKey.isValidEd25519PublicKey(publicKey)) {
    throw new AppError('INVALID_PUBLIC_KEY', 'Invalid Stellar public key', 400);
  }
  const trusted = await hasUsdcTrustline(publicKey);
  return ok({ trusted, assetCode: usdcCode(), assetIssuer: usdcIssuer() });
}

// POST /api/trustline/usdc { publicKey } — build an unsigned changeTrust XDR to sign.
async function buildTrustline(req: NextRequest) {
  const { publicKey } = bodySchema.parse(await req.json());
  if (!StrKey.isValidEd25519PublicKey(publicKey)) {
    throw new AppError('INVALID_PUBLIC_KEY', 'Invalid Stellar public key', 400);
  }
  const xdr = await buildUsdcTrustlineXdr(publicKey);
  return ok({ xdr, assetCode: usdcCode(), assetIssuer: usdcIssuer() });
}

export const GET = compose(withError)(getStatus);
export const POST = compose(withError)(buildTrustline);
