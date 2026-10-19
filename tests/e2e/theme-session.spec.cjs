const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { switchTab } = require('./navigation.cjs');

const fixture = (artist = 'Aurora') => [
    {
        ts: '2026-03-01T12:00:00Z',
        master_metadata_album_artist_name: artist,
        master_metadata_track_name: 'Runaway',
        ms_played: 60000,
        shuffle: false,
    },
];
async function upload(page, artist) {
    await page.locator('#file-upload').setInputFiles({
        name: 'history.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(fixture(artist))),
    });
    await expect(page.locator('#loading-section')).toBeHidden();
}

test('theme follows the system until explicitly selected and survives reload', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    const toggle = page.getByRole('button', { name: 'Dark theme', exact: true });
    await toggle.focus();
    await page.keyboard.press('Space');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(toggle).toBeFocused();
    await page.emulateMedia({ colorScheme: 'light' });
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    expect(await page.evaluate(() => localStorage.getItem('music-history-theme'))).toBe('light');
});

test('theme works when storage is unavailable', async ({ page }) => {
    await page.addInitScript(() => {
        Storage.prototype.getItem = () => {
            throw new Error('Storage blocked');
        };
        Storage.prototype.setItem = () => {
            throw new Error('Storage blocked');
        };
    });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    await page.locator('#theme-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await upload(page);
    await expect(page.locator('#total-tracks-stat')).toHaveText('1');
    expect(errors).toEqual([]);
});

test('switching theme updates existing charts without changing the analysis or selection', async ({
    page,
}) => {
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await page.goto('/');
    await upload(page);
    await page.locator('.calendar-day[data-date="2026-03-01"]').click();
    const before = await page.locator('#artistsChart').evaluate((canvas) => {
        const chart = Chart.getChart(canvas);
        return { id: chart.id, color: chart.getDatasetMeta(0).data[0].options.backgroundColor };
    });
    await page.locator('#theme-toggle').click();
    const after = await page.locator('#artistsChart').evaluate((canvas) => {
        const chart = Chart.getChart(canvas);
        return { id: chart.id, color: chart.getDatasetMeta(0).data[0].options.backgroundColor };
    });
    expect(after.id).toBe(before.id);
    expect(after.color).not.toBe(before.color);
    expect(after.color).toBe('#28634c');
    await expect(page.locator('.calendar-day.is-selected')).toHaveAttribute(
        'data-date',
        '2026-03-01',
    );
    await expect(page.locator('#total-tracks-stat')).toHaveText('1');
    expect(
        await page
            .locator('#timelineChart')
            .evaluate((canvas) => Chart.getChart(canvas).data.datasets[0].borderColor({})),
    ).toBe('#6750a4');
});

for (const theme of ['light', 'dark']) {
    test(`${theme} theme is accessible across screens and usable at 320px and 200% text size`, async ({
        page,
    }) => {
        test.setTimeout(60000);
        await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
        await page.goto('/');
        const audit = async () => {
            const result = await new AxeBuilder({ page })
                .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
                .analyze();
            expect(result.violations).toEqual([]);
        };
        await audit();
        await upload(page);
        await page.locator('.records-disclosure > summary').click();
        await audit();
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({
            path: `test-results/${test.info().project.name}-${theme}-overview.png`,
            fullPage: true,
        });
        await switchTab(page, 'Scrobblers');
        await audit();
        await switchTab(page, 'Search history');
        await audit();
        await switchTab(page, 'Your history');
        await page.setViewportSize({ width: 320, height: 800 });
        await page.evaluate(() => {
            document.documentElement.style.fontSize = '200%';
        });
        await expect
            .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
            .toBe(true);
        await expect(page.locator('#theme-toggle')).toBeVisible();
        const day = await page.locator('.calendar-day').first().boundingBox();
        expect(day.width).toBeGreaterThanOrEqual(24);
        expect(day.height).toBeGreaterThanOrEqual(24);
    });
}

test('history changes can be undone and clearing can be recovered without storing listening data', async ({
    page,
}) => {
    await page.goto('/');
    await upload(page, 'Aurora');
    await upload(page, 'Radiohead');
    await expect(page.locator('#total-tracks-stat')).toHaveText('2');
    await page.locator('#undo-history-btn').click();
    await expect(page.locator('#total-tracks-stat')).toHaveText('1');
    await expect(page.locator('#top-songs-table')).toContainText('Aurora');
    await expect(page.locator('#top-songs-table')).not.toContainText('Radiohead');
    await page.locator('#clear-history-btn').click();
    await expect(page.locator('#dashboard')).toBeHidden();
    await expect(page.locator('#choose-files-btn')).toBeFocused();
    await switchTab(page, 'Search history');
    await page.locator('#history-search-input').fill('Aurora');
    await expect(page.locator('#history-search-message')).toContainText(
        'Upload your listening history',
    );
    await expect(page.locator('#history-results')).toBeHidden();
    await switchTab(page, 'Your history');
    await page.locator('#undo-history-btn').click();
    await expect(page.locator('#total-tracks-stat')).toHaveText('1');
    await page.locator('.brand').click();
    await expect(page.locator('#total-tracks-stat')).toHaveText('1');
    expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
    await page.reload();
    await expect(page.locator('#dashboard')).toBeHidden();
});
