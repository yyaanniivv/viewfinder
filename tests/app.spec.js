import { test, expect } from '@playwright/test';

test.describe('Viewfinder App', () => {
  test.beforeEach(async ({ page }) => {
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', error => errors.push(error.message));
    page.errors = errors;

    // Clear storage BEFORE navigation
    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
    });

    await page.goto('/');
    await page.waitForSelector('#camera', { state: 'attached', timeout: 10000 });
    await page.waitForTimeout(1000);

    // Reset panel states via exposed APIs
    await page.evaluate(() => {
      if (window.__locationsPanelAPI) {
        window.__locationsPanelAPI.hide();
      }
      if (window.__debugPaneAPI) {
        window.__debugPaneAPI.hide();
      }
    });
    await page.waitForTimeout(100);
  });

  test('should load without runtime errors', async ({ page }) => {
    // Wait for app initialization to complete
    await page.waitForFunction(() => window.__app_initialized === true, { timeout: 15000 }).catch(() => {});

    const runtimeErrors = page.errors.filter(e =>
      !e.includes('favicon') &&
      !e.includes('Manifest') &&
      !e.includes('extension') &&
      !e.includes('404') &&
      !e.includes('favicon.ico')
    );
    expect(runtimeErrors).toHaveLength(0);
  });

  test('should have all module APIs exposed for testing', async ({ page }) => {
    await page.waitForFunction(() => window.__locationsPanelAPI !== undefined, { timeout: 10000 });
    await page.waitForFunction(() => window.__debugPaneAPI !== undefined, { timeout: 10000 });

    const apis = await page.evaluate(() => ({
      locationsPanel: !!window.__locationsPanelAPI,
      debugPane: !!window.__debugPaneAPI,
      hasSetLocations: typeof window.__locationsPanelAPI?.setLocations === 'function',
      hasAddLocations: typeof window.__locationsPanelAPI?.addLocations === 'function',
      hasGetLocationsArray: typeof window.__locationsPanelAPI?.getLocationsArray === 'function',
      hasShow: typeof window.__locationsPanelAPI?.show === 'function',
      hasHide: typeof window.__locationsPanelAPI?.hide === 'function',
      debugHasShow: typeof window.__debugPaneAPI?.show === 'function',
      debugHasHide: typeof window.__debugPaneAPI?.hide === 'function',
    }));

    expect(apis.locationsPanel).toBe(true);
    expect(apis.debugPane).toBe(true);
    expect(apis.hasSetLocations).toBe(true);
    expect(apis.hasAddLocations).toBe(true);
    expect(apis.hasGetLocationsArray).toBe(true);
    expect(apis.hasShow).toBe(true);
    expect(apis.hasHide).toBe(true);
    expect(apis.debugHasShow).toBe(true);
    expect(apis.debugHasHide).toBe(true);
  });

  test('should not have ReferenceError for module functions', async ({ page }) => {
    // Specifically check for ReferenceError which indicates undefined functions
    const referenceErrors = page.errors.filter(e =>
      e.includes('ReferenceError') &&
      !e.includes('favicon') &&
      !e.includes('extension')
    );
    expect(referenceErrors).toHaveLength(0);
  });

  test.describe('Camera Toggle', () => {
    test('camera toggle button exists', async ({ page }) => {
      await expect(page.locator('#camera-toggle-btn')).toBeVisible();
    });

    test('camera toggle shows camera off icon initially', async ({ page }) => {
      const toggleBtn = page.locator('#camera-toggle-btn');
      await expect(toggleBtn.locator('.camera-icon-off')).toBeVisible();
      await expect(toggleBtn.locator('.camera-icon-on')).toBeHidden();
    });
  });

  test.describe('Locations Panel', () => {
    test('locations panel exists and is minimized by default', async ({ page }) => {
      await expect(page.locator('#locations-panel')).toHaveAttribute('data-state', 'minimized');
    });

    test('maximize locations button shows panel via API', async ({ page }) => {
      // Use exposed API to show panel
      await page.evaluate(() => {
        if (window.__locationsPanelAPI) {
          window.__locationsPanelAPI.show();
        }
      });
      await expect(page.locator('#locations-panel')).toHaveAttribute('data-state', 'maximized');
      await expect(page.locator('#locations-panel')).toHaveCSS('display', 'flex');
    });

    test('minimize locations button hides panel via API', async ({ page }) => {
      // First show via API
      await page.evaluate(() => {
        if (window.__locationsPanelAPI) {
          window.__locationsPanelAPI.show();
        }
      });
      await expect(page.locator('#locations-panel')).toHaveAttribute('data-state', 'maximized');

      // Then hide via API
      await page.evaluate(() => {
        if (window.__locationsPanelAPI) {
          window.__locationsPanelAPI.hide();
        }
      });
      await expect(page.locator('#locations-panel')).toHaveAttribute('data-state', 'minimized');
    });

    test('maximize locations button shows panel via click', async ({ page }) => {
      const maximizeBtn = page.locator('#maximize-locations-btn');
      await expect(maximizeBtn).toBeVisible({ timeout: 10000 });

      // Check if click handler is attached
      const hasListener = await page.evaluate(() => {
        const btn = document.getElementById('maximize-locations-btn');
        return btn && btn.onclick !== null;
      });

      await maximizeBtn.click();
      await page.waitForTimeout(500);
      await expect(page.locator('#locations-panel')).toHaveAttribute('data-state', 'maximized');
      await expect(page.locator('#locations-panel')).toHaveCSS('display', 'flex');
    });

    test('settings toggle for locations panel works', async ({ page }) => {
      await page.locator('#version-badge').click();
      await expect(page.locator('#settings-overlay')).toBeVisible();

      await page.locator('#toggle-locations-panel').click();
      await expect(page.locator('#locations-panel')).toHaveAttribute('data-state', 'maximized');

      await page.locator('#settings-close-btn').click();
    });
  });

  test.describe('Debug Pane', () => {
    test('debug pane exists and is minimized by default', async ({ page }) => {
      await expect(page.locator('#debug-pane')).toHaveAttribute('data-state', 'minimized');
    });

    test('maximize debug button shows pane via API', async ({ page }) => {
      await page.evaluate(() => {
        if (window.__debugPaneAPI) {
          window.__debugPaneAPI.show();
        }
      });
      await expect(page.locator('#debug-pane')).toHaveAttribute('data-state', 'maximized');
      await expect(page.locator('#debug-pane')).toHaveCSS('display', 'flex');
    });

    test('minimize debug button hides pane via API', async ({ page }) => {
      await page.evaluate(() => {
        if (window.__debugPaneAPI) {
          window.__debugPaneAPI.show();
        }
      });
      await expect(page.locator('#debug-pane')).toHaveAttribute('data-state', 'maximized');

      await page.evaluate(() => {
        if (window.__debugPaneAPI) {
          window.__debugPaneAPI.hide();
        }
      });
      await expect(page.locator('#debug-pane')).toHaveAttribute('data-state', 'minimized');
    });

    test('clear debug button clears log', async ({ page }) => {
      await page.locator('#maximize-debug-btn').click();
      await page.locator('#clear-debug-btn').click();
      await page.waitForTimeout(100);
    });

    test('settings toggle for debug pane works', async ({ page }) => {
      await page.locator('#version-badge').click();
      await expect(page.locator('#settings-overlay')).toBeVisible();

      await page.locator('#toggle-debug-pane').click();
      await expect(page.locator('#debug-pane')).toHaveAttribute('data-state', 'maximized');

      await page.locator('#settings-close-btn').click();
    });
  });

  test.describe('Compass Toggle', () => {
    test('compass button exists', async ({ page }) => {
      await expect(page.locator('#compass-btn')).toBeVisible();
    });

    test('settings toggle for compass works', async ({ page }) => {
      await page.locator('#version-badge').click();
      await expect(page.locator('#settings-overlay')).toBeVisible();

      const toggle = page.locator('#toggle-compass');
      await expect(toggle).toBeChecked();

      await toggle.click();
      await expect(page.locator('#compass-btn')).toBeHidden();

      await toggle.click();
      await expect(page.locator('#compass-btn')).toBeVisible();

      await page.locator('#settings-close-btn').click();
    });
  });

  test.describe('Location List', () => {
    test('location list renders with sample locations', async ({ page }) => {
      await page.locator('#maximize-locations-btn').click();
      await expect(page.locator('#location-list')).toBeVisible();
      await expect(page.locator('.location-item').first()).toBeVisible();
    });

    test('location visibility toggle works', async ({ page }) => {
      await page.locator('#maximize-locations-btn').click();
      const firstItem = page.locator('.location-item').first();
      const visibilityBtn = firstItem.locator('.visibility-btn');
      const initialIcon = await visibilityBtn.textContent();
      await visibilityBtn.click();
      await page.waitForTimeout(200);
      const newIcon = await visibilityBtn.textContent();
      expect(newIcon).not.toBe(initialIcon);
    });

    test('add location button shows form', async ({ page }) => {
      await page.locator('#maximize-locations-btn').click();
      await page.locator('#add-location-btn').click();
      await expect(page.locator('#location-form-container')).toBeVisible();
      await expect(page.locator('#location-form-container')).toHaveCSS('display', 'block');
    });
  });

  test.describe('Settings Overlay', () => {
    test('opens and closes', async ({ page }) => {
      await page.locator('#version-badge').click();
      await expect(page.locator('#settings-overlay')).toBeVisible();
      await page.locator('#settings-close-btn').click();
      await expect(page.locator('#settings-overlay')).toBeHidden();
    });

    test('clicking overlay background closes it', async ({ page }) => {
      await page.locator('#version-badge').click();
      await expect(page.locator('#settings-overlay')).toBeVisible();
      await page.locator('#settings-overlay').click({ position: { x: 10, y: 10 } });
      await expect(page.locator('#settings-overlay')).toBeHidden();
    });
  });

  test.describe('Zoom Indicator', () => {
    test('zoom indicator exists', async ({ page }) => {
      await expect(page.locator('#zoom-indicator')).toBeAttached();
    });
  });

  test.describe('No console errors during interactions', () => {
    test('interacting with all toggles produces no errors', async ({ page }) => {
      await page.locator('#maximize-locations-btn').click();
      await page.locator('#minimize-locations-btn').click();
      await page.locator('#maximize-debug-btn').click();
      await page.locator('#minimize-debug-btn').click();
      await page.locator('#version-badge').click();
      await page.locator('#toggle-locations-panel').click();
      await page.locator('#toggle-debug-pane').click();
      await page.locator('#toggle-compass').click();
      await page.locator('#settings-close-btn').click();

      const runtimeErrors = page.errors.filter(e =>
        !e.includes('favicon') && !e.includes('Manifest') && !e.includes('extension')
      );
      expect(runtimeErrors).toHaveLength(0);
    });
  });
});