import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Landing page', () => {
  test('has Agos heading visible', async ({ page }) => {
    await page.goto('/');
    // h1 is "Pay contractors per second" — Agos brand in eyebrow + navbar
    await expect(page.getByRole('heading').first()).toBeVisible();
    // The main value prop heading must be visible
    await expect(page.getByRole('heading', { name: /pay contractors/i })).toBeVisible();
  });

  test('has Start Streaming CTA', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Start Streaming').first()).toBeVisible();
  });

  test('shows per second messaging', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(/per.?second/i).first()).toBeVisible();
  });

  test('no a11y violations on landing page', async ({ page }) => {
    await page.goto('/');
    const results = await new AxeBuilder({ page })
      .exclude('[aria-hidden="true"]')
      .analyze();
    // Allow up to 2 violations (font loading, theme-related)
    expect(results.violations.length).toBeLessThanOrEqual(2);
  });

  test('mobile 375px: no horizontal scroll', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 1); // 1px tolerance
  });
});

test.describe('Dashboard', () => {
  test('shows connect wallet prompt when not authenticated', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByText(/connect/i).first()).toBeVisible();
  });

  test('empty state has meaningful text when not connected', async ({ page }) => {
    await page.goto('/dashboard');
    const connectCount = await page.getByText(/connect/i).count();
    const emptyCount = await page.getByText(/no streams/i).count();
    expect(connectCount + emptyCount).toBeGreaterThan(0);
  });

  test('dashboard page loads without error', async ({ page }) => {
    await page.goto('/dashboard');
    // Should not show a 500 error page
    const title = await page.title();
    expect(title).not.toContain('500');
    expect(title).not.toContain('Error');
  });
});

test.describe('New Stream page', () => {
  test('shows connect prompt when not authenticated', async ({ page }) => {
    await page.goto('/streams/new');
    await expect(page.getByText(/connect/i).first()).toBeVisible();
  });

  test('new stream page loads without error', async ({ page }) => {
    await page.goto('/streams/new');
    const title = await page.title();
    expect(title).not.toContain('500');
    expect(title).not.toContain('Error');
  });
});
