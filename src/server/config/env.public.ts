import { z } from 'zod';

const publicEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  NEXT_PUBLIC_APP_NAME: z.string().default('Agos'),
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3004'),
  NEXT_PUBLIC_SUPPORTED_LOCALES: z.string().default('en'),
  NEXT_PUBLIC_DEFAULT_LOCALE: z.string().default('en'),
  NEXT_PUBLIC_LOCALE_PREFIX: z
    .enum(['always', 'as-needed', 'never'])
    .default('as-needed'),
  NEXT_PUBLIC_DEMO_MODE: z
    .string()
    .default('false')
    .transform((v) => v === 'true' || v === '1'),
  NEXT_PUBLIC_REPO_URL: z.string().url().default('https://github.com/'),
  NEXT_PUBLIC_STELLAR_NETWORK: z.enum(['testnet', 'public', 'futurenet']).default('testnet'),
  NEXT_PUBLIC_SOROBAN_STREAM_CONTRACT_ID: z.string().optional(),
});

const parsed = publicEnvSchema.safeParse({
  NODE_ENV: process.env.NODE_ENV,
  NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_SUPPORTED_LOCALES: process.env.NEXT_PUBLIC_SUPPORTED_LOCALES,
  NEXT_PUBLIC_DEFAULT_LOCALE: process.env.NEXT_PUBLIC_DEFAULT_LOCALE,
  NEXT_PUBLIC_LOCALE_PREFIX: process.env.NEXT_PUBLIC_LOCALE_PREFIX,
  NEXT_PUBLIC_DEMO_MODE: process.env.NEXT_PUBLIC_DEMO_MODE,
  NEXT_PUBLIC_REPO_URL: process.env.NEXT_PUBLIC_REPO_URL,
  NEXT_PUBLIC_STELLAR_NETWORK: process.env.NEXT_PUBLIC_STELLAR_NETWORK,
  NEXT_PUBLIC_SOROBAN_STREAM_CONTRACT_ID: process.env.NEXT_PUBLIC_SOROBAN_STREAM_CONTRACT_ID,
});

if (!parsed.success) {
  throw new Error('Invalid public environment variables');
}

export const publicEnv = parsed.data;
export type PublicEnv = typeof publicEnv;
