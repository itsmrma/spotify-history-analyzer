const { test, expect } = require('@playwright/test');
const JSZip = require('jszip');
const AxeBuilder = require('@axe-core/playwright').default;
const play = (artist, track, day, ms = 60000) => ({
    ts: `2026-03-${String(day).padStart(2, '0')}T12:00:00Z`,
    master_metadata_album_artist_name: artist,
    master_metadata_track_name: track,
    ms_played: ms,
});
const fixture = [
    play('Aurora', 'Runaway', 1),
    play('Aurora', 'Runaway', 2),
    play('Aurora', 'The Seed', 3),
    play('Radiohead', 'Everything in Its Right Place', 1),
    null,
    play('Skipped', 'Short', 1, 5000),
];
async function upload(page, data = fixture, name = 'history.json') {
    await page.locator('#file-upload').setInputFiles({
        name,
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(data)),
    });
    await expect(page.locator('#loading-section')).toBeHidden();
}
async function noOverflow(page) {
    expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
}
test.beforeEach(async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.__errors = errors;
    await page.goto('/');
});
test.afterEach(async ({ page }) => expect(page.__errors).toEqual([]));

test('import, switch tabs, search, add files and reimport without losing results', async ({
    page,
}) => {
    await upload(page);
    await expect(page.locator('#total-tracks-stat')).toHaveText('4');
    await expect(page.locator('#total-time-stat')).toHaveText('4m');
    await expect(page.locator('#global-streaks-list')).toContainText('3 days');
    await page.getByRole('tab', { name: 'ListenBrainz' }).click();
    await expect(page.locator('#dashboard')).toBeHidden();
    await page.getByRole('tab', { name: 'Your history' }).click();
    await expect(page.locator('#dashboard')).toBeVisible();
    await page.locator('#artist-search-input').fill('aur');
    await page.locator('#artist-search-input').press('Enter');
    await expect(page.locator('#res-artist-name')).toHaveText('Aurora');
    await expect(page.locator('#res-artist-songs li')).toHaveCount(2);
    await page.locator('#artist-search-input').fill('missing');
    await page.locator('#artist-search-input').press('Enter');
    await expect(page.locator('#search-message')).toBeVisible();
    await upload(page);
    await expect(page.locator('#total-tracks-stat')).toHaveText('4');
    await expect(page.locator('#app-message')).toContainText('duplicate');
    await upload(page, [play('Björk', 'Jóga', 4)]);
    await expect(page.locator('#total-tracks-stat')).toHaveText('5');
    await noOverflow(page);
});

test('ZIP with mixed files and uppercase extensions imports supported plays', async ({ page }) => {
    const zip = new JSZip();
    zip.file('Spotify/History.JSON', JSON.stringify(fixture));
    zip.file('account.json', JSON.stringify({ email: 'unrelated' }));
    zip.file('__MACOSX/History.json', JSON.stringify([play('Ignored', 'T', 1)]));
    await page.locator('#file-upload').setInputFiles({
        name: 'EXPORT.ZIP',
        mimeType: 'application/zip',
        buffer: await zip.generateAsync({ type: 'nodebuffer' }),
    });
    await expect(page.locator('#total-tracks-stat')).toHaveText('4');
    await expect(page.locator('#app-message')).toHaveAttribute('data-kind', 'warning');
});

test('invalid files preserve history and allow the same file to be selected again', async ({
    page,
}) => {
    await upload(page);
    await page.locator('#file-upload').setInputFiles({
        name: 'broken.json',
        mimeType: 'application/json',
        buffer: Buffer.from('{'),
    });
    await expect(page.locator('#app-message')).toHaveAttribute('data-kind', 'error');
    await expect(page.locator('#dashboard')).toBeVisible();
    await expect(page.locator('#total-tracks-stat')).toHaveText('4');
    await expect(page.locator('#file-upload')).toHaveValue('');
});

test('titles and artist names are displayed as text and never executed as HTML', async ({
    page,
}) => {
    const artist = '<img src=x onerror="window.compromised=true">';
    const title = '<svg onload="window.compromised=true">';
    await upload(page, [
        play(artist, title, 1),
        play(artist, title, 2),
        play('__proto__', 'Special', 1),
    ]);
    await expect(page.locator('#top-songs-table')).toContainText(title);
    await expect(
        page.locator('#top-songs-table img, #top-songs-table svg, #global-streaks-list img'),
    ).toHaveCount(0);
    await page.locator('#artist-search-input').fill(artist);
    await page.locator('#artist-search-input').press('Enter');
    await expect(page.locator('#res-artist-name')).toHaveText(artist);
    expect(await page.evaluate(() => window.compromised)).toBeUndefined();
    await noOverflow(page);
});

test('ListenBrainz paginates, integrates and skips repeated downloads', async ({ page }) => {
    await upload(page);
    const oldest = Date.parse('2026-03-04T00:00:00Z') / 1000;
    const requests = [];
    await page.route('https://api.listenbrainz.org/**', async (route) => {
        const url = new URL(route.request().url());
        requests.push(url);
        const listens = url.searchParams.has('max_ts')
            ? []
            : [
                  {
                      listened_at: oldest + 3600,
                      track_metadata: {
                          artist_name: 'Björk',
                          track_name: 'Jóga',
                          additional_info: { duration_ms: 120000 },
                      },
                  },
              ];
        await route.fulfill({ json: { payload: { listens } } });
    });
    for (let i = 0; i < 2; i++) {
        await page.getByRole('tab', { name: 'ListenBrainz' }).click();
        await page.locator('#lb-username').fill('test user');
        await page.locator('#lb-date').fill('2026-03-04');
        await page.locator('#lb-integrate-btn').click();
        await expect(page.locator('#lb-loading')).toBeHidden();
        await expect(page.locator('#dashboard')).toBeVisible();
        await expect(page.locator('#total-tracks-stat')).toHaveText('5');
    }
    expect(requests).toHaveLength(4);
    expect(requests[0].pathname).toContain('test%20user');
    expect(requests[1].searchParams.get('max_ts')).toBe(String(oldest + 3600));
    await expect(page.locator('#total-time-stat')).toHaveText('6m');
});

test('ListenBrainz JSON download marks estimates and does not change history', async ({ page }) => {
    await upload(page);
    await page.route('https://api.listenbrainz.org/**', (route) =>
        route.fulfill({
            json: {
                payload: {
                    listens: [
                        {
                            listened_at: Date.parse('2026-03-04T00:00:00Z') / 1000,
                            track_metadata: { artist_name: 'A', track_name: 'T' },
                        },
                    ],
                },
            },
        }),
    );
    await page.getByRole('tab', { name: 'ListenBrainz' }).click();
    await page.locator('#lb-username').fill('test');
    await page.locator('#lb-date').fill('2026-03-04');
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#lb-download-btn').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(
        'Streaming_History_ListenBrainz_test_2026-03-04.json',
    );
    const data = JSON.parse(require('node:fs').readFileSync(await download.path(), 'utf8'));
    expect(data[0].duration_estimated).toBe(true);
    await page.getByRole('tab', { name: 'Your history' }).click();
    await expect(page.locator('#total-tracks-stat')).toHaveText('4');
});

test('ListenBrainz errors, malformed responses and stalled pages are recoverable', async ({
    page,
}) => {
    await upload(page);
    await page.getByRole('tab', { name: 'ListenBrainz' }).click();
    await page.locator('#lb-username').fill('test');
    await page.locator('#lb-date').fill('2026-03-01');
    await page.route('https://api.listenbrainz.org/**', (route) =>
        route.fulfill({ status: 404, json: {} }),
    );
    await page.locator('#lb-integrate-btn').click();
    await expect(page.locator('#app-message')).toContainText('not found');
    await expect(page.locator('#lb-integrate-btn')).toBeEnabled();
    await page.unroute('https://api.listenbrainz.org/**');
    await page.route('https://api.listenbrainz.org/**', (route) =>
        route.fulfill({
            json: {
                payload: {
                    listens: [
                        {
                            listened_at: Date.parse('2026-03-02T12:00:00Z') / 1000,
                            track_metadata: { artist_name: 'A', track_name: 'T' },
                        },
                    ],
                },
            },
        }),
    );
    await page.locator('#lb-integrate-btn').click();
    await expect(page.locator('#app-message')).toContainText('pagination did not advance');
    await page.getByRole('tab', { name: 'Your history' }).click();
    await expect(page.locator('#total-tracks-stat')).toHaveText('4');
});

test('ListenBrainz download can be cancelled while waiting between pages', async ({ page }) => {
    await page.getByRole('tab', { name: 'ListenBrainz' }).click();
    await page.locator('#lb-username').fill('test');
    await page.locator('#lb-date').fill('2026-03-01');
    await page.route('https://api.listenbrainz.org/**', (route) =>
        route.fulfill({
            json: {
                payload: {
                    listens: [
                        {
                            listened_at: Date.parse('2026-03-02T12:00:00Z') / 1000,
                            track_metadata: { artist_name: 'A', track_name: 'T' },
                        },
                    ],
                },
            },
        }),
    );
    await page.locator('#lb-integrate-btn').click();
    await expect(page.locator('#lb-status')).toContainText('Downloaded');
    await page.locator('#lb-cancel-btn').click();
    await expect(page.locator('#app-message')).toContainText('cancelled');
    await expect(page.locator('#lb-loading')).toBeHidden();
    await expect(page.locator('#lb-integrate-btn')).toBeEnabled();
});

test('no external requests and no page overflow from 320px to desktop', async ({ page }) => {
    const external = [];
    page.on('request', (request) => {
        if (!request.url().startsWith('http://127.0.0.1:4173')) external.push(request.url());
    });
    for (const width of [320, 375, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.reload();
        await noOverflow(page);
        await page.getByRole('tab', { name: 'ListenBrainz' }).click();
        await noOverflow(page);
        await page.getByRole('tab', { name: 'Your history' }).click();
        await upload(page);
        await noOverflow(page);
    }
    expect(external).toEqual([]);
});

test('tabs support keyboard navigation and empty streaks have an explanation', async ({ page }) => {
    await page.locator('#tab-analyze-btn').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#tab-lb-btn')).toBeFocused();
    await expect(page.locator('#tab-lb-btn')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Home');
    await expect(page.locator('#tab-analyze-btn')).toBeFocused();
    await upload(page, [play('A', 'T', 1)]);
    await expect(page.locator('#global-streaks-list')).toContainText('No consecutive-day streaks');
    await page.screenshot({
        path: `test-results/${test.info().project.name}-dashboard.png`,
        fullPage: true,
    });
});

test('main screens pass automated WCAG accessibility checks', async ({ page }) => {
    // Audit settled colours rather than intermediate frames of tab transitions.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.screenshot({
        path: `test-results/${test.info().project.name}-landing.png`,
        fullPage: true,
    });
    const audit = async () => {
        const results = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
            .analyze();
        expect(results.violations).toEqual([]);
    };
    await audit();
    await page.getByRole('tab', { name: 'ListenBrainz' }).click();
    await audit();
    await page.screenshot({
        path: `test-results/${test.info().project.name}-listenbrainz.png`,
        fullPage: true,
    });
    await page.getByRole('tab', { name: 'Your history' }).click();
    await upload(page);
    await audit();
});

test('rate limits retry and empty history leaves the dashboard available', async ({ page }) => {
    await upload(page);
    await page.getByRole('tab', { name: 'ListenBrainz' }).click();
    await page.locator('#lb-username').fill('test');
    await page.locator('#lb-date').fill('2026-03-01');
    let requests = 0;
    await page.route('https://api.listenbrainz.org/**', (route) => {
        requests++;
        return requests === 1
            ? route.fulfill({ status: 429, headers: { 'Retry-After': '0.01' }, json: {} })
            : route.fulfill({ json: { payload: { listens: [] } } });
    });
    await page.locator('#lb-integrate-btn').click();
    await expect(page.locator('#app-message')).toContainText('No listens');
    expect(requests).toBe(2);
    await expect(page.locator('#lb-integrate-btn')).toBeEnabled();
    await page.getByRole('tab', { name: 'Your history' }).click();
    await expect(page.locator('#total-tracks-stat')).toHaveText('4');
});

test('drag and drop imports history and rankings respect the selected limit', async ({ page }) => {
    const data = Array.from({ length: 70 }, (_, i) => play('Aurora', `Song ${i + 1}`, 1));
    const transfer = await page.evaluateHandle((text) => {
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(new File([text], 'history.json', { type: 'application/json' }));
        return dataTransfer;
    }, JSON.stringify(data));
    await page.locator('#upload-section').dispatchEvent('drop', { dataTransfer: transfer });
    await expect(page.locator('#total-tracks-stat')).toHaveText('70');
    await expect(page.locator('#top-songs-table tr')).toHaveCount(70);
    await page.locator('#songs-limit-select').selectOption('25');
    await expect(page.locator('#top-songs-table tr')).toHaveCount(25);
    await page.locator('#songs-limit-select').selectOption('50');
    await expect(page.locator('#top-songs-table tr')).toHaveCount(50);
});
