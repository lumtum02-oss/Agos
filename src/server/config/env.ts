import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  NEXT_PUBLIC_APP_NAME: z.string().default('Agos'),
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3004'),

  DRIZZLE_DATABASE_URL: z.string().url(),

  STELLAR_NETWORK: z.enum(['testnet', 'public', 'futurenet']).default('testnet'),
  STELLAR_HORIZON_URL: z
    .string()
    .url()
    .default('https://horizon-testnet.stellar.org'),
  STELLAR_NETWORK_PASSPHRASE: z
    .string()
    .default('Test SDF Network ; September 2015'),

  SOROBAN_RPC_URL: z.string().url().default('https://soroban-testnet.stellar.org'),
  // AgosStream contract (linear-vesting salary streams). When set, XLM streams
  // are funded into and settled by this contract.
  SOROBAN_STREAM_CONTRACT_ID: z.string().optional(),
  NEXT_PUBLIC_SOROBAN_STREAM_CONTRACT_ID: z.string().optional(),
  // Native XLM Stellar Asset Contract (SAC) id — the token the stream contract custodies.
  XLM_SAC_CONTRACT_ID: z
    .string()
    .default('CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC'),

  SESSION_SECRET: z.string().min(32),
  SESSION_COOKIE_NAME: z.string().default('agos_session'),
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(604800),
  NONCE_TTL_SECONDS: z.coerce.number().int().positive().default(300),

  USDC_ASSET_CODE: z.string().default('USDC'),
  USDC_ASSET_ISSUER_TESTNET: z
    .string()
    .default('GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'),
  USDC_ASSET_ISSUER_PUBLIC: z
    .string()
    .default('GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN'),

  SSE_HEARTBEAT_MS: z.coerce.number().int().positive().default(15000),

  DEMO_MODE: z
    .string()
    .default('false')
    .transform((v) => v === 'true' || v === '1'),

  NEXT_PUBLIC_SUPPORTED_LOCALES: z.string().default('en'),
  NEXT_PUBLIC_DEFAULT_LOCALE: z.string().default('en'),
  NEXT_PUBLIC_LOCALE_PREFIX: z
    .enum(['always', 'as-needed', 'never'])
    .default('as-needed'),

  HUB_STELLAR_SECRET: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:');
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  }
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('Invalid environment variables');
  }
}

// In test mode, provide defaults so tests can import env without full config.
export const env = (parsed.success ? parsed.data : {
  NODE_ENV: 'test',
  NEXT_PUBLIC_APP_NAME: 'Agos',
  NEXT_PUBLIC_APP_URL: 'http://localhost:3004',
  DRIZZLE_DATABASE_URL: 'postgres://test:test@localhost:5432/test',
  STELLAR_NETWORK: 'testnet' as const,
  STELLAR_HORIZON_URL: 'https://horizon-testnet.stellar.org',
  STELLAR_NETWORK_PASSPHRASE: 'Test SDF Network ; September 2015',
  SOROBAN_RPC_URL: 'https://soroban-testnet.stellar.org',
  SOROBAN_STREAM_CONTRACT_ID: undefined,
  NEXT_PUBLIC_SOROBAN_STREAM_CONTRACT_ID: undefined,
  XLM_SAC_CONTRACT_ID: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
  SESSION_SECRET: 'test-session-secret-at-least-32-characters-long',
  SESSION_COOKIE_NAME: 'agos_session',
  SESSION_TTL_SECONDS: 604800,
  NONCE_TTL_SECONDS: 300,
  USDC_ASSET_CODE: 'USDC',
  USDC_ASSET_ISSUER_TESTNET: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
  USDC_ASSET_ISSUER_PUBLIC: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
  SSE_HEARTBEAT_MS: 15000,
  DEMO_MODE: false,
  NEXT_PUBLIC_SUPPORTED_LOCALES: 'en',
  NEXT_PUBLIC_DEFAULT_LOCALE: 'en',
  NEXT_PUBLIC_LOCALE_PREFIX: 'as-needed' as const,
  HUB_STELLAR_SECRET: undefined,
}) as z.infer<typeof envSchema>;

export const USDC_ASSET_ISSUER_VALUE =
  env.STELLAR_NETWORK === 'public'
    ? env.USDC_ASSET_ISSUER_PUBLIC
    : env.USDC_ASSET_ISSUER_TESTNET;
