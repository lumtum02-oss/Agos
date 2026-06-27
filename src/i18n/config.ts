import { publicEnv } from '@/server/config/env.public';

export const locales = publicEnv.NEXT_PUBLIC_SUPPORTED_LOCALES.split(',') as readonly string[];
export const defaultLocale = publicEnv.NEXT_PUBLIC_DEFAULT_LOCALE;
export const localePrefix = publicEnv.NEXT_PUBLIC_LOCALE_PREFIX;
export type Locale = string;
