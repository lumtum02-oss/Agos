import path from 'node:path';
import { type BrowserContext, type Page, chromium, expect, test } from '@playwright/test';
import {
  approveOnce,
  cleanup,
  FREIGHTER,
  getExtensionId,
  launchWithFreighter,
  onboardFreighter,
} from '../../../../../shared/freighter/freighter-fixture';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'https://agos-flame.vercel.app';
const SHOTS = path.resolve(process.cwd(), '..', 'screen-shot');
const shot = (name: string) => path.join(SHOTS, name);
const PUB = FREIGHTER.deployerPublic;
const ADDR_HEAD = PUB.slice(0, 4);

test.describe.configure({ mode: 'serial' });

let context: BrowserContext;
let userDataDir: string;

test.beforeAll(async () => {
  const launched = await launchWithFreighter(chromium);
  context = launched.context;
  userDataDir = launched.userDataDir;
  await onboardFreighter(context);
});

test.afterAll(async () => {
  if (context) await cleanup(context, userDataDir);
});

function walletAddress(page: Page) {
  return page.getByText(new RegExp(ADDR_HEAD)).first();
}

async function clickConnect(page: Page): Promise<void> {
  const connectBtn = page.getByRole('button', { name: /connect wallet/i }).first();
  await expect(connectBtn).toBeVisible({ timeout: 20_000 });
  await connectBtn.click();
}

const APPROVAL_ROUTES = ['grant-access', 'sign-transaction', 'sign-auth-entry', 'sign-message'];

function findApprovalPopup(context: BrowserContext): Page | null {
  const prefix = `chrome-extension://${getExtensionId(context)}`;
  for (const p of context.pages()) {
    if (p.isClosed() || !p.url().startsWith(prefix)) continue;
    if (APPROVAL_ROUTES.some((route) => p.url().includes(route))) return p;
  }
  return null;
}

async function captureApprovalPopup(
  context: BrowserContext,
  file: string,
  ms: number,
): Promise<void> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const popup = findApprovalPopup(context);
    if (popup) {
      await popup.waitForTimeout(500);
      await popup.screenshot({ path: file, type: 'jpeg', quality: 85 }).catch(() => {});
      return;
    }
    await new Promise((r) => setTimeout(r, 150));
  }
}

async function approveUntilConnected(
  context: BrowserContext,
  page: Page,
  ms: number,
): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await walletAddress(page).isVisible().catch(() => false)) return true;
    await approveOnce(context, { timeout: 5_000 }).catch(() => {});
    await page.waitForTimeout(500);
  }
  return walletAddress(page).isVisible().catch(() => false);
}

async function connectWallet(context: BrowserContext, page: Page): Promise<void> {
  await clickConnect(page);
  await captureApprovalPopup(context, shot('02-connect-popup.jpg'), 15_000);
  await approveOnce(context, { timeout: 60_000 }).catch(() => {});
  await captureApprovalPopup(context, shot('03-approve.jpg'), 15_000);
  await approveOnce(context, { timeout: 60_000 }).catch(() => {});
  if (await approveUntilConnected(context, page, 20_000)) return;

  for (let attempt = 0; attempt < 3; attempt++) {
    if (await walletAddress(page).isVisible().catch(() => false)) return;
    await clickConnect(page);
    if (await approveUntilConnected(context, page, 30_000)) return;
  }
  await expect(walletAddress(page)).toBeVisible({ timeout: 15_000 });
}

async function fillStreamForm(page: Page): Promise<void> {
  await page.locator('#addr').fill(PUB);
  await page.locator('#name').fill('Engineering retainer');
  await page.locator('#title').fill('Protocol work');
  await page.locator('#monthly').fill('2592');
  await page.locator('#funded').fill('50');
}

test('real Freighter: connect (SEP-10) + create XLM stream + on-chain withdraw', async () => {
  test.setTimeout(360_000);
  const page = await context.newPage();

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: /pay contractors/i })).toBeVisible({
    timeout: 30_000,
  });
  await page.screenshot({ path: shot('01-landing.jpg'), type: 'jpeg', quality: 85, fullPage: true });

  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded' });
  await connectWallet(context, page);
  await expect(page.getByRole('link', { name: /new stream/i }).first()).toBeVisible({
    timeout: 15_000,
  });

  await page.goto(`${BASE_URL}/streams/new`, { waitUntil: 'domcontentloaded' });
  await fillStreamForm(page);
  await page.screenshot({ path: shot('04-new-stream.jpg'), type: 'jpeg', quality: 85, fullPage: true });

  await page.getByRole('button', { name: /create stream/i }).click();
  await page.waitForURL(/\/streams\/[0-9a-f-]{36}/, { timeout: 90_000 });
  await expect(page.getByText(/claimable right now/i)).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: shot('05-stream-active.jpg'), type: 'jpeg', quality: 85, fullPage: true });

  let withdraw: { ok?: boolean; data?: { txHash?: string }; error?: { message?: string } } = {};
  page.on('response', async (r) => {
    if (r.url().includes('/withdraw') && r.request().method() === 'POST') {
      try {
        withdraw = await r.json();
      } catch {
        /* ignore */
      }
    }
  });

  await page.getByRole('button', { name: /withdraw earned/i }).click();
  await expect(page.getByText(/withdrew/i).first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/payment confirmed on stellar/i).first()).toBeVisible({
    timeout: 60_000,
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: shot('06-withdraw-success.jpg'), type: 'jpeg', quality: 85, fullPage: true });

  const txLink = page.locator('a[href*="stellar.expert/explorer/testnet/tx/"]').first();
  await expect(txLink).toBeVisible({ timeout: 20_000 });
  const href = await txLink.getAttribute('href');
  expect(href).toMatch(/stellar\.expert\/explorer\/testnet\/tx\/[0-9a-f]{64}/);
  expect(withdraw.ok, `withdraw failed: ${withdraw.error?.message}`).toBeTruthy();
  expect(withdraw.data?.txHash, 'real tx hash present').toBeTruthy();
  // biome-ignore lint/suspicious/noConsole: surface the hash for the convert report
  console.log('PROD_TX_HASH=' + (withdraw.data?.txHash ?? href?.split('/tx/')[1] ?? ''));

  await page.goto(`${BASE_URL}/stats`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: /agos in numbers/i })).toBeVisible({
    timeout: 20_000,
  });
  await page.screenshot({ path: shot('07-stats.jpg'), type: 'jpeg', quality: 85, fullPage: true });
});

test('mobile landing renders without horizontal scroll', async () => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  const overflow = await page.evaluate(() => document.body.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(2);
  await page.screenshot({ path: shot('08-mobile.jpg'), type: 'jpeg', quality: 85, fullPage: true });
});
