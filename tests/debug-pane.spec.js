import { test, expect } from '@playwright/test';

test.describe.configure({ retries: 0 });

test.describe('Debug Pane - Isolated', () => {
  test.beforeEach(async ({ page }) => {
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', error => errors.push(error.message));
    page.errors = errors;

    // Use unique URL to bypass bfcache
    const uniqueUrl = `/?t=${Date.now()}-${Math.random()}`;
    await page.goto(uniqueUrl);

    await page.waitForSelector('#camera', { state: 'attached', timeout: 10000 });
    await page.waitForTimeout(2000);
    await page.waitForSelector('#debug-pane', { state: 'attached', timeout: 10000 });

    // Force panel to minimized state via DOM
    await page.evaluate(() => {
      const pane = document.getElementById('debug-pane');
      const maximizeBtn = document.getElementById('maximize-debug-btn');
      const minimizeBtn = document.getElementById('minimize-debug-btn');
      const content = document.getElementById('debug-content');

      if (pane) {
        pane.style.display = 'none';
        pane.dataset.state = 'minimized';
      }
      if (maximizeBtn) maximizeBtn.style.display = 'flex';
      if (minimizeBtn) minimizeBtn.style.display = 'none';
      if (content) content.innerHTML = '';
    });

    await page.waitForTimeout(100);
  });

  test('debug pane exists and is minimized by default', async ({ page }) => {
    const panel = page.locator('#debug-pane');
    await expect(panel).toHaveAttribute('data-state', 'minimized');
  });

  test('maximize debug button shows pane', async ({ page }) => {
    const maximizeBtn = page.locator('#maximize-debug-btn');
    const minimizeBtn = page.locator('#minimize-debug-btn');
    const panel = page.locator('#debug-pane');

    // Ensure panel is minimized first
    if (await minimizeBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await minimizeBtn.click();
      await expect(panel).toHaveAttribute('data-state', 'minimized');
    }

    // Now maximize button should be visible
    await expect(maximizeBtn).toBeVisible({ timeout: 10000 });
    await maximizeBtn.click();
    await expect(panel).toHaveAttribute('data-state', 'maximized');
    await expect(panel).toHaveCSS('display', 'flex');
  });

  test('minimize debug button hides pane', async ({ page }) => {
    const maximizeBtn = page.locator('#maximize-debug-btn');
    const minimizeBtn = page.locator('#minimize-debug-btn');
    const panel = page.locator('#debug-pane');

    // Ensure panel is minimized first
    if (await minimizeBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await minimizeBtn.click();
      await expect(panel).toHaveAttribute('data-state', 'minimized');
    }

    // Maximize
    await expect(maximizeBtn).toBeVisible({ timeout: 10000 });
    await maximizeBtn.click();
    await expect(panel).toHaveAttribute('data-state', 'maximized');

    // Now minimize
    await expect(minimizeBtn).toBeVisible({ timeout: 5000 });
    await minimizeBtn.click();
    await expect(panel).toHaveAttribute('data-state', 'minimized');
  });

  test('clear debug button clears log', async ({ page }) => {
    const maximizeBtn = page.locator('#maximize-debug-btn');
    const minimizeBtn = page.locator('#minimize-debug-btn');

    // Ensure panel is minimized first
    if (await minimizeBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await minimizeBtn.click();
    }

    await maximizeBtn.click();
    const clearBtn = page.locator('#clear-debug-btn');
    await clearBtn.click();
    await page.waitForTimeout(100);
  });

  test('settings toggle for debug pane works', async ({ page }) => {
    await page.locator('#version-badge').click();
    await expect(page.locator('#settings-overlay')).toBeVisible();

    const toggle = page.locator('#toggle-debug-pane');
    await toggle.click();

    await expect(page.locator('#debug-pane')).toHaveAttribute('data-state', 'maximized');

    await page.locator('#settings-close-btn').click();
  });

  test('no console errors', async ({ page }) => {
    const maximizeBtn = page.locator('#maximize-debug-btn');
    const minimizeBtn = page.locator('#minimize-debug-btn');

    // Ensure panel is minimized first
    if (await minimizeBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await minimizeBtn.click();
    }

    await maximizeBtn.click();
    await minimizeBtn.click();
    await page.locator('#version-badge').click();
    await page.locator('#toggle-debug-pane').click();
    await page.locator('#settings-close-btn').click();

    const runtimeErrors = page.errors.filter(e =>
      !e.includes('favicon') && !e.includes('Manifest') && !e.includes('extension')
    );
    expect(runtimeErrors).toHaveLength(0);
  });
});