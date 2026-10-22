// Optional interoperability test. Run with SCROBBL_TEST_BINARY pointing to a built
// scrobbl-rs executable. Only disposable storage and synthetic listens are used.
const { test, expect } = require('@playwright/test');
const { mkdtemp, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const net = require('node:net');
const { switchTab } = require('./navigation.cjs');

test('real Rust API: cross-origin CORS, coherent pagination, historical incremental, revocation and expiry', async ({
    page,
    browser,
}) => {
    test.skip(
        !process.env.SCROBBL_TEST_BINARY,
        'Set SCROBBL_TEST_BINARY to opt into real-server interoperability.',
    );
    test.setTimeout(90000);
    const directory = await mkdtemp(join(tmpdir(), 'scrobbl-client-wire-'));
    const socket = net.createServer();
    socket.listen(0, '127.0.0.1');
    await once(socket, 'listening');
    const port = socket.address().port;
    await new Promise((done) => socket.close(done));
    const origin = `http://127.0.0.1:${port}`;
    const child = spawn(resolve(process.env.SCROBBL_TEST_BINARY), [], {
        env: {
            ...process.env,
            SCROBBL_BIND: '127.0.0.1',
            SCROBBL_PORT: String(port),
            SCROBBL_DATA_DIR: directory,
            SCROBBL_EXTERNAL_ORIGIN: origin,
            SPOTIFY_CLIENT_ID: '',
            SPOTIFY_CLIENT_SECRET: '',
        },
        stdio: 'ignore',
    });
    const owner = await browser.newContext();
    try {
        await expect
            .poll(
                async () => {
                    if (child.exitCode !== null)
                        throw new Error('Disposable scrobbl.rs stopped unexpectedly.');
                    return (
                        await owner.request.get(`${origin}/healthz`).catch(() => null)
                    )?.status();
                },
                { timeout: 15000 },
            )
            .toBe(200);
        const setup = await owner.request.post(`${origin}/api/setup`, {
            headers: { Origin: origin },
            data: { password: 'synthetic integration password only' },
        });
        expect(setup.status()).toBe(200);
        const { csrf } = await setup.json();
        const headers = { Origin: origin, 'X-CSRF-Token': csrf };
        const write = (path, data) => owner.request.post(`${origin}${path}`, { headers, data });
        expect(
            (await write('/api/v1/api-keys/cors', { origins: ['http://127.0.0.1:4173'] })).status(),
        ).toBe(200);
        const created = await (
            await write('/api/v1/api-keys', {
                name: 'Disposable client test',
                application: 'spotify_analysis',
                expires_at_ms: null,
            })
        ).json();
        expect(typeof created.secret).toBe('string');
        const preflight = await owner.request.fetch(`${origin}/api/v1/info`, {
            method: 'OPTIONS',
            headers: {
                Origin: 'http://127.0.0.1:4173',
                'Access-Control-Request-Method': 'GET',
                'Access-Control-Request-Headers': 'authorization',
            },
        });
        expect(preflight.status()).toBe(204);
        expect(preflight.headers()['access-control-allow-origin']).toBe('http://127.0.0.1:4173');
        const denied = await owner.request.fetch(`${origin}/api/v1/info`, {
            method: 'OPTIONS',
            headers: {
                Origin: 'https://unapproved.example',
                'Access-Control-Request-Method': 'GET',
                'Access-Control-Request-Headers': 'authorization',
            },
        });
        expect(denied.headers()['access-control-allow-origin']).toBeUndefined();

        const row = (index, ts = '2026-03-29T00:30:00Z') => ({
            ts,
            ms_played: index === 1001 ? 10000 : 60000,
            master_metadata_track_name: `Synthetic song ${index}`,
            master_metadata_album_artist_name: 'Synthetic artist',
            master_metadata_album_album_name: 'Synthetic album',
            spotify_track_uri: `spotify:track:${String(index).padStart(22, '0')}`,
        });
        async function upload(rows) {
            const response = await owner.request.post(`${origin}/api/import/spotify`, {
                headers,
                multipart: {
                    files: {
                        name: 'Streaming_History_Audio_test.json',
                        mimeType: 'application/json',
                        buffer: Buffer.from(JSON.stringify(rows)),
                    },
                },
            });
            expect(response.status()).toBe(200);
            const { job_id } = await response.json();
            await expect
                .poll(
                    async () =>
                        (
                            await (
                                await owner.request.get(`${origin}/api/v1/activities/${job_id}`)
                            ).json()
                        ).activity?.state,
                    { timeout: 30000 },
                )
                .toBe('completed');
        }
        await upload(Array.from({ length: 1002 }, (_, index) => row(index)));
        await page.goto('/');
        await switchTab(page, 'Scrobblers');
        await page.locator('#scrobbl-url').fill(`${origin}/api/v1`);
        await page.locator('#scrobbl-key').fill(created.secret);
        const readRequests = [];
        page.on('request', (request) => {
            if (request.url().startsWith(`${origin}/api/v1/`)) readRequests.push(request);
        });
        await page.locator('#scrobbl-connect').click();
        await expect(page.locator('#scrobbl-status')).toContainText('1,002 canonical listens', {
            timeout: 15000,
        });
        expect(
            readRequests.filter((r) => new URL(r.url()).pathname.endsWith('/listens')),
        ).toHaveLength(2);
        await switchTab(page, 'Your history');
        await expect(page.locator('#total-tracks-stat')).toHaveText('1,001');
        await upload([row(1002, '2020-01-01T12:00:00Z')]);
        await switchTab(page, 'Scrobblers');
        await page.locator('#scrobbl-refresh').click();
        await expect(page.locator('#scrobbl-status')).toContainText('1,003 canonical listens');
        expect(readRequests.some((r) => new URL(r.url()).pathname.endsWith('/changes'))).toBe(true);
        await switchTab(page, 'Your history');
        await expect(page.locator('#total-tracks-stat')).toHaveText('1,002');
        await expect(page.locator('#history-summary')).toContainText('2020');
        for (const request of readRequests) expect(request.headers().cookie).toBeUndefined();
        expect(
            (
                await owner.request.post(`${origin}/api/spotify/disconnect`, {
                    headers: { ...headers, Authorization: `Bearer ${created.secret}` },
                    data: {},
                })
            ).status(),
        ).toBe(403);
        expect((await write(`/api/v1/api-keys/${created.id}/revoke`, {})).status()).toBe(200);
        await switchTab(page, 'Scrobblers');
        await page.locator('#scrobbl-auto').check();
        await page.locator('#scrobbl-refresh').click();
        await expect(page.locator('#scrobbl-status')).toContainText('invalid, expired or revoked');
        await expect(page.locator('#scrobbl-auto')).not.toBeChecked();
        const expiring = await (
            await write('/api/v1/api-keys', {
                name: 'Expiry only',
                application: 'spotify_analysis',
                expires_at_ms: Date.now() + 500,
            })
        ).json();
        await expect
            .poll(async () =>
                (
                    await owner.request.get(`${origin}/api/v1/info`, {
                        headers: { Authorization: `Bearer ${expiring.secret}` },
                    })
                ).status(),
            )
            .toBe(401);
        await page.locator('#scrobbl-key').fill(expiring.secret);
        page.once('dialog', (dialog) => dialog.accept());
        await page.locator('#scrobbl-connect').click();
        await expect(page.locator('#scrobbl-status')).toContainText('invalid, expired or revoked');
        await switchTab(page, 'Your history');
        await expect(page.locator('#total-tracks-stat')).toHaveText('1,002');
    } finally {
        await owner.close();
        if (child.exitCode === null) {
            const ended = once(child, 'exit');
            child.kill();
            await ended;
        }
        // directory is the exact path returned by mkdtemp, never the user's archive.
        await rm(directory, { recursive: true, force: true });
    }
});
