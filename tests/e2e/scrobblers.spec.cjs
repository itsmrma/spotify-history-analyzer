const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const AxeBuilder = require('@axe-core/playwright').default;
const ts = (day) => Date.parse(`2026-03-${String(day).padStart(2, '0')}T12:00:00Z`) / 1000;
const fm = (day) => ({
    name: `Song ${day}`,
    artist: { '#text': 'Artist' },
    album: { '#text': 'Album' },
    date: { uts: String(ts(day)) },
});
const mlj = (day) => ({
    time: ts(day),
    track: { artists: ['Artist'], title: `Song ${day}` },
    duration: 120,
});

async function setup(page, source) {
    await page.getByRole('tab', { name: 'Scrobblers' }).click();
    await page.locator('#scrobbler-source').selectOption(source);
    await page.locator('#lb-date').fill('04/03/2026');
    if (source === 'lastfm') {
        await page.locator('#lb-username').fill('test');
        await page.locator('#scrobbler-api-key').fill('test-key');
    } else await page.locator('#scrobbler-server').fill('https://maloja.example/library/');
}

test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.emulateMedia({ reducedMotion: 'reduce' });
});

for (const source of ['lastfm', 'maloja']) {
    const endpoint =
        source === 'lastfm' ? 'https://ws.audioscrobbler.com/**' : 'https://maloja.example/**';
    const reply = (page, items, more = false) =>
        source === 'lastfm'
            ? {
                  recenttracks: {
                      track: items,
                      '@attr': { page: String(page), totalPages: more ? '2' : String(page) },
                  },
              }
            : { status: 'ok', list: items, pagination: { page, next_page: more ? '/next' : null } };
    const item = source === 'lastfm' ? fm : mlj;

    test(`${source} paginates, applies UTC start and integrates without duplicates`, async ({
        page,
    }) => {
        await setup(page, source);
        const pages = [];
        await page.route(endpoint, (route) => {
            const url = new URL(route.request().url());
            const number = Number(url.searchParams.get('page'));
            pages.push(number);
            if (source === 'lastfm') {
                expect(url.searchParams.get('from')).toBe(
                    String(Date.parse('2026-03-04T00:00:00Z') / 1000 - 1),
                );
                expect(url.searchParams.get('api_key')).toBe('test-key');
            } else {
                expect(url.pathname).toBe('/library/apis/mlj_1/scrobbles');
                expect(url.searchParams.get('from')).toBe('2026/03/03');
            }
            const first = number === (source === 'lastfm' ? 1 : 0);
            return route.fulfill({
                json: reply(number, first ? [item(5)] : [item(4), item(3)], first),
            });
        });
        for (let i = 0; i < 2; i++) {
            if (i) await page.getByRole('tab', { name: 'Scrobblers' }).click();
            await page.locator('#lb-integrate-btn').click();
            await expect(page.locator('#total-tracks-stat')).toHaveText('2');
            await expect(page.locator('#app-message')).toContainText(
                i ? '0 plays added' : '2 plays added',
            );
        }
        expect(pages).toEqual(source === 'lastfm' ? [1, 2, 1, 2] : [0, 1, 0, 1]);
    });

    test(`${source} downloads compatible JSON and recovers from provider errors`, async ({
        page,
    }) => {
        await setup(page, source);
        await page.route(endpoint, (route) =>
            route.fulfill({ json: reply(source === 'lastfm' ? 1 : 0, [item(5)]) }),
        );
        const downloading = page.waitForEvent('download');
        await page.locator('#lb-download-btn').click();
        const download = await downloading;
        const data = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
        expect(data[0].source).toBe(source);
        expect(data[0].duration_estimated).toBe(source === 'lastfm');
        await expect(page.locator('#dashboard')).toBeHidden();
        await page.getByRole('tab', { name: 'Your history' }).click();
        await page.locator('#file-upload').setInputFiles({
            name: 'scrobbles.json',
            mimeType: 'application/json',
            buffer: Buffer.from(JSON.stringify(data)),
        });
        await expect(page.locator('#total-tracks-stat')).toHaveText('1');
        await page.getByRole('tab', { name: 'Scrobblers' }).click();
        await page.unroute(endpoint);
        await page.route(endpoint, (route) =>
            route.fulfill({
                json:
                    source === 'lastfm'
                        ? { error: 10, message: 'Invalid API key' }
                        : { status: 'error', error: { desc: 'Unavailable' } },
            }),
        );
        await page.locator('#lb-integrate-btn').click();
        await expect(page.locator('#app-message')).toContainText(
            source === 'lastfm' ? 'Invalid API key' : 'Unavailable',
        );
        await expect(page.locator('#lb-integrate-btn')).toBeEnabled();
        await page.getByRole('tab', { name: 'Your history' }).click();
        await expect(page.locator('#total-tracks-stat')).toHaveText('1');
    });

    test(`${source} cancels partial downloads and rejects repeated pages`, async ({ page }) => {
        await setup(page, source);
        await page.route(endpoint, (route) => {
            const number = Number(new URL(route.request().url()).searchParams.get('page'));
            return route.fulfill({ json: reply(number, [item(5)], true) });
        });
        await page.locator('#lb-integrate-btn').click();
        await expect(page.locator('#lb-status')).toContainText('Downloaded');
        await expect(page.locator('#scrobbler-source')).toBeDisabled();
        await page.locator('#lb-cancel-btn').click();
        await expect(page.locator('#app-message')).toContainText('cancelled');
        await expect(page.locator('#dashboard')).toBeHidden();
        await page.locator('#lb-integrate-btn').click();
        await expect(page.locator('#app-message')).toContainText('pagination did not advance');
        await expect(page.locator('#dashboard')).toBeHidden();
        await expect(page.locator('#scrobbler-source')).toBeEnabled();
    });

    test(`${source} form is accessible and responsive`, async ({ page }) => {
        await setup(page, source);
        const audit = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
            .analyze();
        expect(audit.violations).toEqual([]);
        for (const width of [320, 768, 1440]) {
            await page.setViewportSize({ width, height: 900 });
            expect(
                await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
            ).toBe(true);
        }
        await page.screenshot({
            path: `test-results/${test.info().project.name}-${source}.png`,
            fullPage: true,
        });
    });
}

test('Last.fm rate limits retry and now-playing tracks are excluded', async ({ page }) => {
    await setup(page, 'lastfm');
    let count = 0;
    await page.route('https://ws.audioscrobbler.com/**', (route) =>
        route.fulfill({
            json:
                ++count === 1
                    ? { error: 29, message: 'Rate limit exceeded' }
                    : {
                          recenttracks: {
                              track: [
                                  {
                                      name: 'Live',
                                      artist: { '#text': 'Artist' },
                                      '@attr': { nowplaying: 'true' },
                                  },
                                  fm(5),
                              ],
                              '@attr': { totalPages: '1' },
                          },
                      },
        }),
    );
    await page.locator('#lb-integrate-btn').click();
    await expect(page.locator('#total-tracks-stat')).toHaveText('1');
    expect(count).toBe(2);
});

test('Maloja connection errors explain file import fallback', async ({ page }) => {
    await setup(page, 'maloja');
    await page.route('https://maloja.example/**', (route) => route.abort('failed'));
    await page.locator('#lb-integrate-btn').click();
    await expect(page.locator('#app-message')).toContainText('CORS');
    await expect(page.locator('#lb-integrate-btn')).toBeEnabled();
});

test('native scrobbler exports can be uploaded together', async ({ page }) => {
    await page.locator('#file-upload').setInputFiles([
        {
            name: 'lastfm.json',
            mimeType: 'application/json',
            buffer: Buffer.from(JSON.stringify({ recenttracks: { track: [fm(4)] } })),
        },
        {
            name: 'maloja.json',
            mimeType: 'application/json',
            buffer: Buffer.from(JSON.stringify({ list: [mlj(5)] })),
        },
    ]);
    await expect(page.locator('#total-tracks-stat')).toHaveText('2');
});
