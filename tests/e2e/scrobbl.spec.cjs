const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { switchTab } = require('./navigation.cjs');
const F = require('../fixtures/scrobbl.cjs');
const key = 'synthetic-read-key';
const endpoint = 'https://archive.example/api/v1/**';
async function form(page) {
    await switchTab(page, 'Scrobblers');
    await page.locator('#scrobbl-url').fill('https://archive.example/api/v1');
    await page.locator('#scrobbl-key').fill(key);
}
async function connect(page) {
    await page.locator('#scrobbl-connect').click();
    await expect(page.locator('#scrobbl-status')).toContainText('Complete copy');
}
async function imported(page) {
    await page.locator('#file-upload').setInputFiles({
        name: 'test.json',
        mimeType: 'application/json',
        buffer: Buffer.from(
            JSON.stringify([
                {
                    ts: '2026-03-01T12:00:00Z',
                    master_metadata_album_artist_name: 'Previous artist',
                    master_metadata_track_name: 'Previous song',
                    ms_played: 60000,
                },
            ]),
        ),
    });
    await expect(page.locator('#total-tracks-stat')).toHaveText('1');
}
test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('replacement requires confirmation and failed multi-page loads preserve imported history', async ({
    page,
}) => {
    await imported(page);
    await form(page);
    let requests = 0;
    await page.route(endpoint, (route) => {
        requests++;
        const url = new URL(route.request().url());
        return route.fulfill({
            status: url.searchParams.has('cursor') ? 400 : 200,
            json: url.pathname.endsWith('info')
                ? F.info()
                : url.searchParams.has('cursor')
                  ? { error: { code: 'invalid_request' } }
                  : F.page({ complete: false, next_cursor: 'next', sync_cursor: null }),
        });
    });
    page.once('dialog', (dialog) => dialog.dismiss());
    await page.locator('#scrobbl-connect').click();
    expect(requests).toBe(0);
    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('#scrobbl-connect').click();
    await expect(page.locator('#scrobbl-status')).toContainText('rejected this selection');
    await expect(page.locator('#scrobbl-last-success')).toContainText('never');
    await expect(page.locator('#scrobbl-key')).toHaveValue('');
    await switchTab(page, 'Your history');
    await expect(page.locator('#total-tracks-stat')).toHaveText('1');
    await expect(page.locator('#top-songs-table')).toContainText('Previous song');
    await expect(page.locator('#add-files-btn')).toBeDisabled();
    await switchTab(page, 'Scrobblers');
    await page.locator('#scrobbl-disconnect').click();
    await expect(page.locator('#lb-integrate-btn')).toBeEnabled();
});

test('canonical archive uses server countability, preserves repeats and sources, and displays unknown durations', async ({
    page,
    context,
}) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await context.addCookies([
        { name: 'owner-session', value: 'synthetic-owner', url: 'https://archive.example' },
    ]);
    const seen = [];
    await page.route(endpoint, (route) => {
        seen.push(route.request());
        return route.fulfill({
            json: route.request().url().endsWith('/info')
                ? F.info()
                : F.page({
                      items: [
                          F.listen('a', { listened_ms: null, duration_kind: 'unknown' }),
                          F.listen('b', { listened_ms: null, duration_kind: 'unknown' }),
                          F.listen('short', { listened_ms: 10000, counted: false }),
                      ],
                  }),
        });
    });
    await form(page);
    await connect(page);
    await expect(page.locator('#scrobbl-auto')).not.toBeChecked();
    await expect(page.locator('#scrobbl-interval')).toHaveValue('120');
    await switchTab(page, 'Your history');
    await expect(page.locator('#total-tracks-stat')).toHaveText('2');
    await expect(page.locator('#total-time-stat')).toHaveText('Unknown');
    await expect(page.locator('#time-caption')).toContainText('2 unknown durations');
    await expect(page.locator('#top-songs-table .song-plays')).toHaveText('2');
    await switchTab(page, 'Search history');
    await page.locator('#history-search-input').fill('Archive artist');
    await page.locator('#history-search-form').evaluate((form) => form.requestSubmit());
    await expect(page.locator('#history-plays .history-play-row')).toHaveCount(3);
    await expect(page.locator('#history-plays')).toContainText('Unknown');
    await expect(page.locator('#history-plays')).toContainText('spotify, ListenBrainz');
    await expect(page.locator('#history-result-summary')).toContainText(
        '1 excluded from statistics',
    );
    for (const request of seen) {
        expect(request.headers().authorization).toBe(`Bearer ${key}`);
        expect(request.headers().cookie).toBeUndefined();
        expect(request.url()).not.toContain(key);
    }
    expect(errors).toEqual([]);
});

test('incrementals replace historical data, expired checkpoints reload, and auth errors stop automatic reads', async ({
    page,
}) => {
    let revision = 1,
        fullLoads = 0;
    await page.route(endpoint, (route) => {
        const url = new URL(route.request().url());
        if (url.pathname.endsWith('info')) return route.fulfill({ json: F.info({ revision }) });
        if (url.pathname.endsWith('changes') && revision === 3)
            return route.fulfill({ status: 409, json: { error: { code: 'cursor_invalid' } } });
        if (revision === 4)
            return route.fulfill({
                status: 401,
                json: { error: { code: 'invalid_key', message: key } },
            });
        const full = url.pathname.endsWith('listens');
        if (full) fullLoads++;
        return route.fulfill({
            json: F.page({
                revision,
                from_revision: full ? null : revision - 1,
                sync_cursor: `checkpoint-${revision}`,
                items:
                    revision === 3
                        ? []
                        : revision === 2
                          ? [F.listen('old', { played_at_ms: 1 })]
                          : [F.listen()],
                removed: revision === 2 ? [{ id: 'a', replacement_id: 'old' }] : [],
            }),
        });
    });
    await form(page);
    await connect(page);
    revision = 2;
    await page.locator('#scrobbl-refresh').click();
    await expect(page.locator('#scrobbl-status')).toContainText('Complete copy');
    await switchTab(page, 'Your history');
    await expect(page.locator('#history-summary')).toContainText('1970');
    await switchTab(page, 'Scrobblers');
    revision = 3;
    await page.locator('#scrobbl-refresh').click();
    await expect(page.locator('#scrobbl-status')).toContainText('0 canonical listens');
    expect(fullLoads).toBe(2);
    await page.locator('#scrobbl-auto').check();
    revision = 4;
    await page.locator('#scrobbl-refresh').click();
    await expect(page.locator('#scrobbl-status')).toContainText('invalid, expired or revoked');
    await expect(page.locator('#scrobbl-status')).not.toContainText(key);
    await expect(page.locator('#scrobbl-auto')).not.toBeChecked();
    await expect(page.locator('#scrobbl-connect')).toBeEnabled();
});

test('automatic updates run in background, coalesce with resume, and never overlap', async ({
    page,
}) => {
    await page.clock.install();
    let changes = 0,
        release;
    let pending = null;
    await page.route(endpoint, async (route) => {
        const delta = new URL(route.request().url()).pathname.endsWith('changes');
        if (delta) {
            changes++;
            if (pending) await pending;
        }
        return route.fulfill({
            json: route.request().url().endsWith('/info')
                ? F.info({ revision: 1 + changes })
                : F.page({
                      from_revision: delta ? changes : null,
                      revision: 1 + changes,
                      items: [],
                      sync_cursor: `checkpoint-${changes}`,
                  }),
        });
    });
    await form(page);
    await connect(page);
    await page.clock.fastForward(120000);
    expect(changes).toBe(0);
    await page.locator('#scrobbl-interval').fill('30');
    await page.locator('#scrobbl-interval').blur();
    await page.locator('#scrobbl-auto').check();
    await page.evaluate(() =>
        Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }),
    );
    pending = new Promise((r) => {
        release = r;
    });
    await page.clock.fastForward(31000);
    await expect.poll(() => changes).toBe(1);
    await page.clock.fastForward(31000);
    expect(changes).toBe(1);
    await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', {
            value: 'visible',
            configurable: true,
        });
        document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(changes).toBe(1);
    release();
    pending = null;
    await expect(page.locator('#scrobbl-refresh')).toBeEnabled();
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect.poll(() => changes).toBe(2);
    await expect(page.locator('#scrobbl-status')).toContainText('Complete copy');
    await page.locator('#scrobbl-disconnect').click();
    await page.clock.fastForward(120000);
    expect(changes).toBe(2);
});

test('disconnect prevents late publication, retains data and requires confirmation before a different import', async ({
    page,
}) => {
    let release,
        updating = false;
    const delayed = new Promise((r) => {
        release = r;
    });
    await page.route(endpoint, async (route) => {
        const delta = route.request().url().includes('/changes');
        if (delta) {
            updating = true;
            await delayed;
        }
        await route
            .fulfill({
                json: route.request().url().endsWith('/info')
                    ? F.info()
                    : F.page({
                          from_revision: delta ? 1 : null,
                          items: delta ? [F.listen('late')] : [F.listen()],
                          revision: delta ? 2 : 1,
                      }),
            })
            .catch(() => {});
    });
    await form(page);
    await connect(page);
    await page.locator('#scrobbl-refresh').click();
    await expect.poll(() => updating).toBe(true);
    await page.locator('#scrobbl-disconnect').click();
    release();
    await expect(page.locator('#scrobbl-status')).toContainText('Disconnected');
    await switchTab(page, 'Your history');
    await expect(page.locator('#total-tracks-stat')).toHaveText('1');
    await expect(page.locator('#top-songs-table')).toContainText('Archive song');
    page.once('dialog', (dialog) => dialog.accept());
    await imported(page);
    await expect(page.locator('#top-songs-table')).toContainText('Previous song');
    await expect(page.locator('#top-songs-table')).not.toContainText('Archive song');
});

test('network errors are actionable; reload clears connection, key, data and automatic options', async ({
    page,
}) => {
    await page.route(endpoint, (route) => route.abort('failed'));
    await form(page);
    await page.locator('#scrobbl-connect').click();
    await expect(page.locator('#scrobbl-status')).toContainText('DNS');
    await expect(page.locator('#scrobbl-last-success')).toContainText('never');
    await page.locator('#scrobbl-disconnect').click();
    await page.unroute(endpoint);
    await page.route(endpoint, (route) =>
        route.fulfill({ json: route.request().url().endsWith('/info') ? F.info() : F.page() }),
    );
    await page.locator('#scrobbl-key').fill(key);
    await connect(page);
    await page.locator('#scrobbl-auto').check();
    const stored = await page.evaluate(async () => ({
        local: { ...localStorage },
        session: { ...sessionStorage },
        databases: typeof indexedDB.databases === 'function' ? await indexedDB.databases() : [],
    }));
    expect(JSON.stringify(stored)).not.toMatch(/synthetic-read-key|Archive song|checkpoint/);
    expect(stored.session).toEqual({});
    expect(stored.databases).toEqual([]);
    await page.reload();
    await switchTab(page, 'Scrobblers');
    await expect(page.locator('#scrobbl-key')).toHaveValue('');
    await expect(page.locator('#scrobbl-auto')).not.toBeChecked();
    await expect(page.locator('#scrobbl-status')).toHaveText('Not connected.');
    await switchTab(page, 'Your history');
    await expect(page.locator('#dashboard')).toBeHidden();
});

test('connection form is accessible, keyboard usable and responsive with synthetic data', async ({
    page,
}) => {
    await form(page);
    for (const width of [320, 768, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
            true,
        );
    }
    const audit = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
    expect(audit.violations).toEqual([]);
    await page.locator('#scrobbl-key').fill('');
    await page.screenshot({
        path: `test-results/${test.info().project.name}-scrobbl-form.png`,
        fullPage: true,
    });
});

test('a throttled continuation respects Retry-After and retries the same page before atomic publication', async ({
    page,
}) => {
    await page.clock.install();
    let continuations = 0;
    await page.route(endpoint, (route) => {
        const url = new URL(route.request().url());
        if (url.pathname.endsWith('/info')) return route.fulfill({ json: F.info() });
        if (!url.searchParams.has('cursor'))
            return route.fulfill({
                json: F.page({ complete: false, next_cursor: 'continue', sync_cursor: null }),
            });
        continuations++;
        if (continuations === 1)
            return route.fulfill({
                status: 429,
                headers: { 'Retry-After': '35', 'Access-Control-Expose-Headers': 'Retry-After' },
                json: { error: { code: 'rate_limited' } },
            });
        expect(url.searchParams.get('cursor')).toBe('continue');
        return route.fulfill({ json: F.page({ items: [F.listen('b')] }) });
    });
    await form(page);
    await page.locator('#scrobbl-connect').click();
    await expect(page.locator('#scrobbl-status')).toContainText('limiting requests');
    await expect(page.locator('#dashboard')).toBeHidden();
    await page.clock.fastForward(30000);
    expect(continuations).toBe(1);
    await page.clock.fastForward(6000);
    await expect(page.locator('#scrobbl-status')).toContainText('2 canonical listens');
    expect(continuations).toBe(2);
    await switchTab(page, 'Your history');
    await expect(page.locator('#total-tracks-stat')).toHaveText('2');
});
