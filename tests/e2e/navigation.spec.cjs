const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { openNavigation, switchTab, selectDropdown } = require('./navigation.cjs');

test('mobile drawer animates, traps focus, changes tabs and dismisses safely', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    const toggle = page.locator('#mobile-nav-toggle');
    const drawer = page.locator('#mobile-nav-drawer');
    await expect(drawer).toBeHidden();
    await toggle.click();
    await expect(drawer).toBeVisible();
    await expect(page.locator('#mobile-nav-close')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(page.locator('#tab-analyze-btn')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('#mobile-nav-close')).toBeFocused();
    expect(await drawer.evaluate((node) => getComputedStyle(node).transitionDuration)).toContain(
        '0.24s',
    );
    await expect.poll(async () => (await drawer.boundingBox()).x).toBe(0);
    const audit = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
    expect(audit.violations).toEqual([]);
    await page.screenshot({
        path: `test-results/${test.info().project.name}-mobile-navigation.png`,
    });
    await page.getByRole('tab', { name: 'Search history' }).click();
    await expect(drawer).toBeHidden();
    await expect(toggle).toBeFocused();
    await expect(page.locator('#view-explore')).toBeVisible();
    await expect(page.locator('#mobile-current-tab')).toHaveText('Search history');
    await openNavigation(page);
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await openNavigation(page);
    await expect.poll(async () => (await drawer.boundingBox()).x).toBe(0);
    await page.mouse.click(365, 400);
    await expect(drawer).toBeHidden();
    await openNavigation(page);
    await page.locator('#mobile-nav-close').click();
    await expect(drawer).toBeHidden();
    expect(await page.locator('.app-shell').evaluate((node) => node.inert)).toBe(false);
});

test('drawer handles rotation, desktop resizing and reduced motion', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await openNavigation(page);
    expect(
        await page
            .locator('#mobile-nav-drawer')
            .evaluate((node) => getComputedStyle(node).transitionDuration),
    ).toBe('0s');
    await page.setViewportSize({ width: 600, height: 320 });
    await expect(page.locator('#mobile-nav-close')).toBeVisible();
    await switchTab(page, 'Scrobblers');
    await expect(page.locator('#view-lb')).toBeVisible();
    await openNavigation(page);
    await page.setViewportSize({ width: 1024, height: 768 });
    await expect(page.locator('#mobile-nav-toggle')).toBeHidden();
    await expect(page.locator('#desktop-nav-host #tabs-nav')).toBeVisible();
    await expect(page.locator('#tab-lb-btn')).toBeFocused();
    expect(await page.locator('.app-shell').evaluate((node) => node.inert)).toBe(false);
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(page.locator('#mobile-nav-toggle')).toBeFocused();
    await expect(page.locator('#mobile-nav-drawer')).toBeHidden();
});

test('all dropdowns use Material menus and stay synchronized with filters and resets', async ({
    page,
}) => {
    await page.goto('/');
    await page.locator('#file-upload').setInputFiles({
        name: 'history.json',
        mimeType: 'application/json',
        buffer: Buffer.from(
            JSON.stringify([
                {
                    ts: '2025-01-01T12:00:00Z',
                    master_metadata_album_artist_name: 'Artist',
                    master_metadata_track_name: 'Song',
                    ms_played: 60000,
                },
                {
                    ts: '2026-01-01T12:00:00Z',
                    master_metadata_album_artist_name: 'Artist',
                    master_metadata_track_name: 'Song',
                    ms_played: 60000,
                },
            ]),
        ),
    });
    await expect(page.locator('select:visible')).toHaveCount(0);
    const period = page.locator('#period-select-trigger');
    await period.focus();
    await period.press('Enter');
    await period.press('End');
    await period.press('Enter');
    await expect(page.locator('#custom-dates')).toBeVisible();
    await expect(period).toContainText('Custom dates');
    await page.locator('#reset-filters-btn').click();
    await expect(period).toContainText('All history');
    await period.press('ArrowDown');
    await period.press('2');
    await period.press('0');
    await period.press('2');
    await period.press('6');
    await period.press('Enter');
    await expect(page.locator('#period-select')).toHaveValue('2026');
    await expect(period).toContainText('2026');
    await selectDropdown(page, 'ranking-metric', 'ms');
    await expect(page.locator('#ranking-metric-trigger')).toContainText('Listening time');
    await selectDropdown(page, 'calendar-year', '2025');
    await expect(page.locator('#calendar-year-trigger')).toContainText('2025');
    await selectDropdown(page, 'songs-limit-select', '25');
    await expect(page.locator('#songs-limit-select-trigger')).toContainText('25 songs');
    await switchTab(page, 'Scrobblers');
    await selectDropdown(page, 'scrobbler-source', 'lastfm');
    await expect(page.locator('#scrobbler-source-trigger')).toContainText('Last.fm');
    await expect(page.locator('#scrobbler-api-key')).toBeVisible();
});
