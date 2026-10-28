// Level 2: a real Chromium via Playwright with a persistent profile, so logins
// and passed verifications are remembered (~/.second-brain/browser).

import { createRequire } from 'node:module';

const TIMEOUT_MS = 45_000;

export class BrowserUnavailable extends Error {}

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    try {
      // Fall back to a globally installed copy (NODE_PATH).
      return createRequire(import.meta.url)('playwright');
    } catch {
      throw new BrowserUnavailable('playwright is not installed; run: npx playwright install chromium');
    }
  }
}

export async function fetchWithBrowser(url, { profileDir, headless = true, timeoutMs = TIMEOUT_MS } = {}) {
  const { chromium } = await loadPlaywright();
  let context;
  try {
    context = await chromium.launchPersistentContext(profileDir, { headless, locale: 'zh-CN' });
  } catch (err) {
    throw new BrowserUnavailable(`cannot start Chromium: ${err.message.split('\n')[0]}`);
  }
  try {
    const page = await context.newPage();
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    // Give client-side rendering a moment; ignore pages that never go idle.
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    return { status: response?.status() ?? 200, html: await page.content(), finalUrl: page.url() };
  } finally {
    await context.close();
  }
}
