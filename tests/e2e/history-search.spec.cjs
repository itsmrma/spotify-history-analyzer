const { openNavigation, switchTab, selectDropdown } = require('./navigation.cjs');
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const play = (artist, track, ts, album, extra = {}) => ({
    ts,
    master_metadata_album_artist_name: artist,
    master_metadata_track_name: track,
    master_metadata_album_album_name: album,
    ms_played: 61000,
    platform: 'android',
    shuffle: true,
    offline: false,
    ...extra,
});
const fixture = [
    play('Aurora', 'Runaway', '2025-12-31T23:45:12Z', 'Shared album'),
    play('Aurora', 'Runaway', '2026-03-04T12:01:02Z', 'Shared album', {
        conn_country: 'IT',
        reason_end: 'trackdone',
    }),
    play('Aurora', 'The Seed', '2026-04-03T08:30:40Z', 'Another album'),
    play('Aurora', 'Undated', null, null),
    play('Other artist', 'Runaway', '2026-03-01T10:00:00Z', 'Shared album'),
];
async function upload(page, data = fixture) {
    await page.locator('#file-upload').setInputFiles({
        name: 'history.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(data)),
    });
    await expect(page.locator('#loading-section')).toBeHidden();
}
async function search(page, type, query) {
    await switchTab(page, 'Search history');
    await page.locator('#history-search-type').click();
    await page.locator(`#history-type-${type}`).click();
    await page.locator('#history-search-input').fill(query);
    await page.locator('#history-search-btn').click();
}
test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('Material type menu supports pointer, keyboard selection and dismissal', async ({ page }) => {
    await upload(page);
    await switchTab(page, 'Search history');
    const trigger = page.locator('#history-search-type');
    const menu = page.locator('#history-types');
    await trigger.click();
    await expect(menu).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(menu.getByRole('option', { name: 'Artist', exact: true })).toHaveAttribute(
        'aria-selected',
        'true',
    );
    const audit = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
    expect(audit.violations).toEqual([]);
    await trigger.press('End');
    await trigger.press('Enter');
    await expect(trigger).toContainText('Song');
    await expect(menu).toBeHidden();
    await trigger.press('ArrowDown');
    await trigger.press('Home');
    await trigger.press('ArrowDown');
    await trigger.press(' ');
    await expect(trigger).toContainText('Album');
    await trigger.click();
    await trigger.press('Home');
    await trigger.press('Escape');
    await expect(trigger).toContainText('Album');
    await expect(menu).toBeHidden();
    await trigger.click();
    await page.getByRole('heading', { name: 'Search your listening history' }).click();
    await expect(menu).toBeHidden();
    await trigger.focus();
    await trigger.press('Enter');
    await trigger.press('Tab');
    await expect(menu).toBeHidden();
    await expect(page.locator('#history-search-input')).toBeFocused();
    await trigger.click();
    await menu.getByRole('option', { name: 'Artist', exact: true }).click();
    await expect(trigger).toContainText('Artist');
    await page.locator('#history-search-input').fill('Aurora');
    await page.locator('#history-search-btn').click();
    await expect(page.locator('#history-plays tr')).toHaveCount(4);
});

test('suggestions wait 500ms after the last edit and keyboard selection searches every loaded date', async ({
    page,
}) => {
    await upload(page);
    await selectDropdown(page, 'period-select', '2026');
    await switchTab(page, 'Search history');
    await page.clock.install({ time: new Date('2026-10-03T12:00:00Z') });
    await page.clock.pauseAt(new Date('2026-10-03T12:00:01Z'));
    await page.locator('#history-search-input').fill('Au');
    await page.clock.runFor(300);
    await page.locator('#history-search-input').fill('Aur');
    await page.clock.runFor(499);
    expect(await page.locator('#history-suggestions').isVisible()).toBe(false);
    await page.clock.runFor(1);
    await expect(page.getByRole('option', { name: 'Aurora 4 plays' })).toBeVisible();
    await page.locator('#history-search-input').press('ArrowDown');
    await page.locator('#history-search-input').press('Enter');
    await expect(page.locator('#history-result-title')).toHaveText('Aurora');
    await expect(page.locator('#history-plays tr')).toHaveCount(4);
    await expect(page.locator('#history-plays tr').first()).toContainText('03/04/2026');
    await expect(page.locator('#history-plays tr').first()).toContainText('08:30:40');
    await expect(page.locator('#history-plays')).toContainText('31/12/2025');
    await expect(page.locator('#history-plays tr').last()).toContainText('Not recorded');
    await expect(page.locator('#history-plays')).toContainText('android');
    await expect(page.locator('#history-plays')).toContainText('1m 01s');
    await page.locator('#history-plays tr').nth(1).getByText('More', { exact: true }).click();
    await expect(page.locator('#history-plays tr').nth(1)).toContainText('IT');
    await expect(page.locator('#history-plays tr').nth(1)).toContainText('trackdone');
});

test('song and album suggestions distinguish artists with identical titles', async ({ page }) => {
    await upload(page);
    for (const [type, query, count] of [
        ['song', 'Runaway', 2],
        ['album', 'Shared album', 2],
    ]) {
        await search(page, type, query);
        await expect(page.locator('#history-suggestions').getByRole('option')).toHaveCount(2);
        await page
            .getByRole('option', { name: `${query} Aurora · ${count} plays`, exact: true })
            .click();
        await expect(page.locator('#history-plays tr')).toHaveCount(2);
        await expect(page.locator('#history-result-artist')).toHaveText('Aurora');
        await expect(page.locator('#history-plays')).not.toContainText('Other artist');
    }
    await page.locator('#history-search-input').fill('Missing artist');
    await expect(page.locator('#history-search-message')).toContainText('No matching');
    await expect(page.locator('#history-results')).toBeHidden();
});

test('pagination reaches the full history and added files refresh the selected result', async ({
    page,
}) => {
    const data = Array.from({ length: 205 }, (_, index) =>
        play(
            'Artist',
            `Track ${index}`,
            new Date(Date.parse('2026-01-01T00:00:00Z') + index * 60000).toISOString(),
            'Album',
        ),
    );
    await upload(page, data);
    await search(page, 'artist', 'Artist');
    await expect(page.locator('#history-plays tr')).toHaveCount(100);
    await expect(page.locator('#history-page-summary')).toContainText('of 205');
    await expect(page.locator('#history-prev')).toBeDisabled();
    await page.locator('#history-next').click();
    await expect(page.locator('#history-page-summary')).toContainText('101–200');
    await page.locator('#history-next').click();
    await expect(page.locator('#history-plays tr')).toHaveCount(5);
    await expect(page.locator('#history-plays tr').last()).toContainText('Track 0');
    await expect(page.locator('#history-next')).toBeDisabled();
    await page.locator('#history-prev').click();
    await expect(page.locator('#history-plays tr')).toHaveCount(100);
    await switchTab(page, 'Your history');
    await upload(page, [play('Artist', 'Newest', '2026-05-01T12:00:00Z', 'Album')]);
    await switchTab(page, 'Search history');
    await expect(page.locator('#history-result-summary')).toContainText('206 plays');
    await expect(page.locator('#history-plays tr').first()).toContainText('Newest');
});

test('day/month/year inputs filter April 3 and synchronize calendar selections', async ({
    page,
}) => {
    await upload(page);
    await selectDropdown(page, 'period-select', 'custom');
    await expect(page.locator('#filter-start')).toHaveValue('31/12/2025');
    await page.locator('#filter-start').fill('03042026');
    await expect(page.locator('#filter-start')).toHaveValue('03/04/2026');
    await page.locator('#filter-start').fill('');
    await page.locator('#filter-start').pressSequentially('03042026');
    await expect(page.locator('#filter-start')).toHaveValue('03/04/2026');
    await page.locator('#filter-end').fill('03/04/2026');
    await page.getByRole('button', { name: 'Apply dates' }).click();
    await expect(page.locator('#total-tracks-stat')).toHaveText('1');
    await expect(page.locator('#top-songs-table')).toContainText('The Seed');
    await page.locator('#filter-start').fill('31/02/2026');
    expect(await page.locator('#filter-start').evaluate((input) => input.validity.valid)).toBe(
        false,
    );
    await page.locator('#reset-filters-btn').click();
    expect(await page.locator('#filter-start').evaluate((input) => input.validity.valid)).toBe(
        true,
    );
    await switchTab(page, 'Scrobblers');
    await page.locator('#lb-date').locator('..').locator('.date-native').fill('2026-04-03');
    await expect(page.locator('#lb-date')).toHaveValue('03/04/2026');
    await page.locator('#lb-username').fill('test');
    await page.route('https://api.listenbrainz.org/**', (route) =>
        route.fulfill({ json: { payload: { listens: [] } } }),
    );
    await page.locator('#lb-integrate-btn').click();
    await expect(page.locator('#app-message')).toContainText('No listens');
});

test('search empty states, results and long names remain accessible on narrow screens', async ({
    page,
}) => {
    await switchTab(page, 'Search history');
    await expect(page.locator('#history-search-message')).toContainText('Upload');
    await switchTab(page, 'Your history');
    await upload(page, [
        play(
            '<script>long_artist_name_with_no_spaces_'.repeat(3),
            '<b>Track</b>',
            '2026-03-01T10:00:00Z',
            'Album',
        ),
    ]);
    await search(page, 'album', 'Album');
    for (const width of [320, 375, 600, 768, 900, 901, 1024, 1199, 1200, 1440, 1920]) {
        await page.setViewportSize({ width, height: 1000 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
            true,
        );
        expect(
            await page
                .locator('.history-table-wrapper')
                .evaluate((wrapper) => wrapper.scrollWidth <= wrapper.clientWidth + 1),
        ).toBe(true);
        await page.locator('#history-search-type').click();
        const menu = await page.locator('#history-types').boundingBox();
        expect(menu.x).toBeGreaterThanOrEqual(0);
        expect(menu.x + menu.width).toBeLessThanOrEqual(width);
        await page.locator('#history-type-album').click();
        if (width >= 1200) {
            const panel = await page.locator('#view-explore').boundingBox();
            expect(panel.width / width).toBeCloseTo(0.8, 2);
        }
        if (width <= 900) {
            const cells = page.locator('#history-plays tr').first().locator('td');
            await expect(cells).toHaveCount(9);
            expect(
                await cells.last().evaluate((cell) => getComputedStyle(cell, '::before').content),
            ).toBe('"Details"');
        }
    }
    const audit = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
    expect(audit.violations).toEqual([]);
    await page.setViewportSize({
        width: test.info().project.name === 'desktop' ? 1440 : 375,
        height: 1000,
    });
    await page.screenshot({
        path: `test-results/${test.info().project.name}-history-search.png`,
        fullPage: true,
    });
});
