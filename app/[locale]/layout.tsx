import type { Metadata, Viewport } from 'next';
import { Inter, Playfair_Display } from 'next/font/google';
import { notFound } from 'next/navigation';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';
import { routing } from '@/i18n/routing';
import { publicEnv } from '@/server/config/env.public';
import { Toaster } from 'sonner';
import '../globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-heading',
  display: 'swap',
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  const tBrand = await getTranslations({ locale, namespace: 'Hero' });
  const brandEyebrow = tBrand('eyebrow');
  const title = t('title');
  const description = t('description');
  const metadataBase = new URL(publicEnv.NEXT_PUBLIC_APP_URL);

  return {
    metadataBase,
    title: {
      default: title,
      template: `%s · ${brandEyebrow}`,
    },
    description,
    applicationName: brandEyebrow,
    keywords: ['Stellar', 'USDC', 'salary streaming', 'payroll', 'crypto', 'Agos'],
    authors: [{ name: brandEyebrow }],
    generator: 'Next.js',
    openGraph: {
      type: 'website',
      siteName: brandEyebrow,
      title,
      description,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
    robots: { index: true, follow: true },
  };
}

export const viewport: Viewport = {
  themeColor: '#0891b2', // cyan-600
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning className={`${inter.variable} ${playfair.variable}`}>
      <body className="min-h-screen bg-background text-foreground antialiased font-sans">
        <NextIntlClientProvider messages={messages}>
          <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
            {children}
            <Toaster richColors position="top-right" />
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
