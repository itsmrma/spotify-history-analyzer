const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const AxeBuilder = require('@axe-core/playwright').default;
const play = (artist, track, ts, ms = 60000, extra = {}) => ({
    ts,
    master_metadata_album_artist_name: artist,
    master_metadata_track_name: track,
    ms_played: ms,
    ...extra,
});
const fixture = [
    play('Aurora', 'Runaway', '2025-12-31T12:00:00Z', 60000, {
        master_metadata_album_album_name: 'All My Demons',
        shuffle: true,
        offline: false,
        platform: 'android',
    }),
    play('Aurora', 'Runaway', '2026-01-01T12:00:00Z', 60000, {
        master_metadata_album_album_name: 'All My Demons',
        shuffle: false,
        offline: false,
        platform: 'android',
    }),
    play('Aurora', 'Runaway', '2026-01-01T12:05:00Z', 60000, {
        master_metadata_album_album_name: 'All My Demons',
        shuffle: true,
        offline: true,
        platform: 'android',
    }),
    play('Aurora', 'The Seed', '2026-03-01T23:00:00Z', 60000, {
        master_metadata_album_album_name: 'A Different Kind',
    }),
    play('Björk', 'Jóga', '2026-03-02T02:00:00Z', 600000, {
        master_metadata_album_album_name: 'Homogenic',
        shuffle: false,
        offline: false,
        platform: 'windows',
    }),
    play('Radiohead', 'Everything', '2024-02-29T12:00:00Z'),
    play('Undated', 'Mystery', null),
];
async function upload(page, data = fixture) {
    await page.locator('#file-upload').setInputFiles({
        name: 'history.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(data)),
    });
    await expect(page.locator('#dashboard')).toBeVisible();
}
async function noOverflow(page) {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
    );
}
test.beforeEach(async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.__errors = errors;
    await page.goto('/');
    await page.emulateMedia({ reducedMotion: 'reduce' });
});
test.afterEach(async ({ page }) => expect(page.__errors).toEqual([]));

test('period and metric filters update totals, rankings, discoveries and graphs together', async ({
    page,
}) => {
    await upload(page);
    await expect(page.locator('#total-tracks-stat')).toHaveText('7');
    await page.locator('#period-select').selectOption('2026');
    await expect(page.locator('#total-tracks-stat')).toHaveText('4');
    await expect(page.locator('#total-artists-stat')).toHaveText('2');
    await expect(page.locator('#filter-message')).toContainText(
        '1 plays without valid timestamps excluded',
    );
    await expect(page.locator('#discoveries-list')).toContainText('Björk');
    await expect(page.locator('#discoveries-list')).not.toContainText('Aurora');
    await expect(page.locator('#top-songs-table tr').first()).toContainText('Runaway');
    const months = await page
        .locator('#timelineChart')
        .evaluate((canvas) => Chart.getChart(canvas).data.labels.length);
    expect(months).toBe(12);
    await page.locator('#ranking-metric').selectOption('ms');
    await expect(page.locator('#top-songs-table tr').first()).toContainText('Jóga');
    await expect(page.locator('#top-albums-list li').first()).toContainText('Homogenic');
    await page.getByRole('tab', { name: 'Scrobblers' }).click();
    await page.getByRole('tab', { name: 'Your history' }).click();
    await expect(page.locator('#period-select')).toHaveValue('2026');
    await page.locator('#reset-filters-btn').click();
    await expect(page.locator('#total-tracks-stat')).toHaveText('7');
    await expect(page.locator('#ranking-metric')).toHaveValue('count');
    await noOverflow(page);
});

test('custom dates are inclusive and invalid or empty ranges are recoverable', async ({ page }) => {
    await upload(page);
    await page.locator('#period-select').selectOption('custom');
    await page.locator('#filter-start').fill('01/01/2026');
    await page.locator('#filter-end').fill('01/01/2026');
    await page.getByRole('button', { name: 'Apply dates' }).click();
    await expect(page.locator('#total-tracks-stat')).toHaveText('2');
    await page.locator('#filter-start').fill('01/03/2026');
    await page.getByRole('button', { name: 'Apply dates' }).click();
    await expect(page.locator('#filter-message')).toContainText('start on or before the end');
    await expect(page.locator('#total-tracks-stat')).toHaveText('2');
    await page.locator('#filter-start').fill('01/02/2026');
    await page.locator('#filter-end').fill('28/02/2026');
    await page.getByRole('button', { name: 'Apply dates' }).click();
    await expect(page.locator('#filtered-empty')).toBeVisible();
    await expect(page.locator('#export-rankings-btn')).toBeDisabled();
    await expect(page.locator('#top-songs-table')).toContainText('No songs');
    await page.locator('#reset-filters-btn').click();
    await expect(page.locator('#filtered-empty')).toBeHidden();
    await expect(page.locator('#total-tracks-stat')).toHaveText('7');
});

test('calendar covers leap years, opens daily songs and supports arrow keys', async ({ page }) => {
    await upload(page);
    await page.locator('#calendar-year').selectOption('2024');
    await expect(page.locator('.calendar-day')).toHaveCount(366);
    const leapDay = page.locator('.calendar-day[data-date="2024-02-29"]');
    await leapDay.click();
    await expect(page.locator('#calendar-day-detail')).toContainText('Everything');
    await leapDay.press('ArrowDown');
    await expect(page.locator('.calendar-day[data-date="2024-03-01"]')).toBeFocused();
    await page.locator('#calendar-year').selectOption('2026');
    await expect(page.locator('.calendar-day')).toHaveCount(365);
    await page.locator('.calendar-day[data-date="2026-01-01"]').click();
    await expect(page.locator('#calendar-day-detail')).toContainText('2 plays');
    await expect(page.locator('#calendar-day-detail')).toContainText('Runaway');
    await noOverflow(page);
});

test('album, habit, platform and yearly recap details use the imported metadata', async ({
    page,
}) => {
    await upload(page);
    await expect(page.locator('#listening-habits')).toContainText('50.0%');
    await expect(page.locator('#listening-habits')).toContainText('25.0%');
    await expect(page.locator('#platforms-list')).toContainText('android');
    await expect(page.locator('#platforms-list')).toContainText('Not recorded');
    await expect(page.locator('[data-fact="listening-streak"] strong')).toHaveText('2 days');
    await page
        .locator('.year-card')
        .filter({ has: page.locator('.year-number', { hasText: '2025' }) })
        .getByRole('button')
        .click();
    await expect(page.locator('#period-select')).toHaveValue('2025');
    await expect(page.locator('#total-tracks-stat')).toHaveText('1');
    await page.locator('#reset-filters-btn').click();
    await page.locator('#discoveries-list button').filter({ hasText: 'Björk' }).click();
    await expect(page.locator('#res-artist-name')).toHaveText('Björk');
    await expect(page.locator('#res-artist-facts')).toContainText('10m');
});

test('CSV export includes every song in the filtered ranking and escapes formula-like names', async ({
    page,
}) => {
    const data = Array.from({ length: 120 }, (_, index) =>
        play(
            index === 0 ? '=SUM(1,2)' : 'Artist',
            index === 0 ? ' +formula' : `Song ${index}`,
            '2026-03-01T12:00:00Z',
        ),
    );
    await upload(page, data);
    await page.locator('#songs-limit-select').selectOption('25');
    await page.locator('#period-select').selectOption('2026');
    const downloading = page.waitForEvent('download');
    await page.locator('#export-rankings-btn').click();
    const file = await downloading;
    expect(file.suggestedFilename()).toContain('2026-01-01_2026-12-31_plays');
    const csv = fs.readFileSync(await file.path(), 'utf8');
    expect(csv.split('\r\n')).toHaveLength(121);
    expect(csv).toContain("'=SUM(1,2)");
    expect(csv).toContain("'+formula");
});

test('missing dates and optional metadata have clear empty states and remain accessible', async ({
    page,
}) => {
    await upload(page, [play('A', 'Undated', null)]);
    await expect(page.locator('#total-tracks-stat')).toHaveText('1');
    await expect(page.locator('#timeline-fallback')).toContainText('No dated plays');
    await expect(page.locator('#weekday-fallback')).toContainText('No dated plays');
    await expect(page.locator('#top-albums-list')).toContainText('not available');
    await expect(page.locator('#platforms-list')).toContainText('not recorded');
    await expect(page.locator('#calendar-year')).toBeDisabled();
    const audit = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
    expect(audit.violations).toEqual([]);
    await page.screenshot({
        path: `test-results/${test.info().project.name}-undated.png`,
        fullPage: true,
    });
    await noOverflow(page);
});

test('expanded dashboard remains responsive and accessible after filters change', async ({
    page,
}) => {
    await upload(page);
    const audit = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
    expect(audit.violations).toEqual([]);
    await page.screenshot({
        path: `test-results/${test.info().project.name}-expanded-dashboard.png`,
        fullPage: true,
    });
    for (const width of [320, 375, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.locator('#period-select').selectOption('2026');
        await noOverflow(page);
        await page.locator('#period-select').selectOption('custom');
        await noOverflow(page);
        await page.locator('#reset-filters-btn').click();
    }
});

test('long platform lists collapse by default and keep the habits card compact', async ({
    page,
}) => {
    await upload(
        page,
        Array.from({ length: 22 }, (_, index) =>
            play(
                'A',
                `Track ${index}`,
                index < 3 ? '2025-12-01T12:00:00Z' : '2026-03-01T12:00:00Z',
                60000,
                { platform: `Device ${index}` },
            ),
        ),
    );
    const toggle = page.locator('#platforms-toggle');
    await expect(page.locator('.platform-item:visible')).toHaveCount(5);
    await expect(toggle).toHaveText('Show all 22 devices & platforms');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    const habits = page.locator('#listening-habits').locator('..');
    const height = (await habits.boundingBox()).height;
    await toggle.focus();
    await toggle.press('Enter');
    await expect(page.locator('.platform-item:visible')).toHaveCount(22);
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect((await habits.boundingBox()).height).toBe(height);
    await page.locator('#ranking-metric').selectOption('ms');
    await expect(page.locator('.platform-item:visible')).toHaveCount(22);
    await toggle.press('Space');
    await expect(page.locator('.platform-item:visible')).toHaveCount(5);
    await page.locator('#period-select').selectOption('2025');
    await expect(toggle).toBeHidden();
    await expect(page.locator('.platform-item:visible')).toHaveCount(3);
    await noOverflow(page);
});
