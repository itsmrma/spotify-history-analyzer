const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Connection, apiBase, selectionFromDates } = require('../../assets/js/scrobbl-client.js');
const A = require('../../assets/js/analytics.js');
const F = require('../fixtures/scrobbl.cjs');
const credentials = { url: 'https://archive.example/api/v1', key: 'synthetic-read-key' };
const deferred = () => {
    let resolve;
    const promise = new Promise((r) => {
        resolve = r;
    });
    return { promise, resolve };
};
function fixture(responses) {
    const requests = [],
        publications = [],
        states = [];
    const connection = new Connection({
        retries: 0,
        fetch: async (url, options) => {
            requests.push({ url: new URL(url), options });
            const next = responses.shift();
            if (typeof next === 'function') return next();
            assert.ok(next, 'Unexpected request');
            return F.json(next.body ?? next, next.status ?? 200, next.headers);
        },
        publish: (entries) => publications.push(entries),
        state: (state) => states.push(state),
    });
    return { connection, requests, publications, states };
}

test('API addresses reject secrets, queries, paths and private HTTP; UTC dates are inclusive across DST', () => {
    assert.equal(apiBase('https://archive.example'), 'https://archive.example/api/v1/');
    assert.equal(apiBase('http://127.0.0.1:3210/api/v1/'), 'http://127.0.0.1:3210/api/v1/');
    for (const url of [
        'http://192.168.1.2',
        'https://user:key@archive.example',
        'https://archive.example/?key=secret',
        'https://archive.example/#secret',
        'https://archive.example/other',
        'file:///archive',
    ])
        assert.throws(() => apiBase(url));
    assert.deepEqual(selectionFromDates('2026-03-29', '2026-03-29'), {
        from_ms: Date.parse('2026-03-29T00:00:00Z'),
        until_ms: Date.parse('2026-03-30T00:00:00Z'),
        counted_only: false,
    });
    assert.throws(() => selectionFromDates('2026-02-30', ''));
    assert.throws(() => selectionFromDates('2026-03-30', '2026-03-29'));
});

test('canonical records preserve repeats, ordered credits, identities and unknown time without generic deduplication', () => {
    const entries = [
        F.listen('a'),
        F.listen('b', { listened_ms: null, duration_kind: 'unknown' }),
        F.listen('c', { track_id: 'different-edition', listened_ms: 10000, counted: false }),
        F.listen('d', {
            track_id: 'different-edition',
            listened_ms: 60000,
            duration_kind: 'estimated',
        }),
    ].map((scrobbl) => ({ scrobbl }));
    const stats = A.analyze(entries);
    assert.equal(stats.totalPlays, 3);
    assert.equal(stats.totalMs, 180000);
    assert.equal(stats.unknownPlays, 1);
    assert.equal(stats.estimatedPlays, 1);
    assert.equal(stats.sortedTracks.length, 2);
    assert.equal(stats.sortedTracks[0].count, 2);
    assert.equal(A.normalizeEntry(entries[1]).ms, null);
    assert.equal(A.normalizeEntry(entries[2]), null);
    assert.equal(A.normalizeEntry(entries[2], { includeUncounted: true }).counted, false);
    assert.deepEqual(A.normalizeEntry(entries[0]).sources, ['spotify', 'listenbrainz']);
    const unknown = A.analyze([entries[1]]);
    assert.equal(unknown.totalPlays, 1);
    assert.equal(A.listeningTime(unknown), 'Unknown');
    assert.match(A.rankingCSV(unknown), /Unknown durations/);
    assert.match(A.rankingCSV(unknown), /"1","","1"$/);
});

test('a complete multi-page copy publishes once and every request omits cookies and caches', async () => {
    const next = deferred();
    const f = fixture([
        F.info(),
        F.page({ complete: false, next_cursor: 'page-b', sync_cursor: null }),
        () => next.promise,
    ]);
    const running = f.connection.connect(credentials);
    assert.equal(f.connection.sync(), running);
    while (f.requests.length < 3) await new Promise(setImmediate);
    assert.equal(f.publications.length, 0);
    next.resolve(F.json(F.page({ items: [F.listen('b')], sync_cursor: 'final' })));
    assert.equal(await running, true);
    assert.deepEqual(
        f.publications[0].map((raw) => raw.scrobbl.id),
        ['a', 'b'],
    );
    assert.equal(f.connection.copy.cursor, 'final');
    for (const { url, options } of f.requests) {
        assert.equal(options.credentials, 'omit');
        assert.equal(options.cache, 'no-store');
        assert.equal(options.redirect, 'error');
        assert.equal(options.referrerPolicy, 'no-referrer');
        assert.equal(options.headers.Authorization, 'Bearer synthetic-read-key');
        assert.ok(!url.href.includes(credentials.key));
    }
    assert.equal(f.requests[2].url.searchParams.get('cursor'), 'page-b');
    assert.equal(f.requests[2].url.searchParams.has('counted_only'), false);
    f.connection.disconnect();
});

test('incrementals apply historical arrivals, upserts and removals atomically and retain the old checkpoint on failure', async () => {
    const f = fixture([
        F.info(),
        F.page(),
        F.info({ revision: 2 }),
        F.page({
            from_revision: 1,
            revision: 2,
            snapshot_id: 'delta',
            items: [
                F.listen('a', { listened_ms: null, duration_kind: 'unknown', counted: false }),
                F.listen('backdated', { played_at_ms: 1 }),
            ],
            sync_cursor: 'checkpoint-b',
        }),
        F.info({ revision: 3 }),
        F.page({
            from_revision: 2,
            revision: 3,
            snapshot_id: 'delta-c',
            items: [],
            removed: [{ id: 'a', replacement_id: 'backdated' }],
            complete: false,
            next_cursor: 'broken',
            sync_cursor: null,
        }),
        { body: { error: { code: 'server_error' } }, status: 500 },
    ]);
    assert.equal(await f.connection.connect(credentials), true);
    assert.equal(await f.connection.sync(), true);
    assert.equal(f.publications.length, 2);
    assert.equal(f.connection.copy.items.get('backdated').played_at_ms, 1);
    assert.equal(f.connection.copy.items.get('a').counted, false);
    assert.equal(await f.connection.sync(), false);
    assert.equal(f.publications.length, 2);
    assert.equal(f.connection.copy.cursor, 'checkpoint-b');
    assert.ok(f.connection.copy.items.has('a'));
    assert.ok(f.connection.notBefore > Date.now());
    f.connection.disconnect();
});

test('removals and selection exits, including unseen IDs, commit with the final checkpoint', async () => {
    const f = fixture([
        F.info(),
        F.page(),
        F.info({ revision: 2 }),
        F.page({
            from_revision: 1,
            revision: 2,
            items: [],
            removed: [
                { id: 'a', replacement_id: null },
                { id: 'unseen', replacement_id: null },
            ],
            sync_cursor: 'empty',
        }),
    ]);
    await f.connection.connect(credentials);
    assert.equal(await f.connection.sync(), true);
    assert.deepEqual(f.publications[1], []);
    assert.equal(f.connection.copy.cursor, 'empty');
    f.connection.disconnect();
});

test('invalid checkpoints restart a full copy while preserving the previous copy until success', async () => {
    const f = fixture([
        F.info(),
        F.page(),
        F.info(),
        { status: 409, body: { error: { code: 'cursor_invalid' } } },
        F.info(),
        F.page({ items: [], sync_cursor: 'empty' }),
    ]);
    await f.connection.connect(credentials);
    assert.equal(await f.connection.sync(), true);
    assert.deepEqual(
        f.requests.map((r) => r.url.pathname),
        [
            '/api/v1/info',
            '/api/v1/listens',
            '/api/v1/info',
            '/api/v1/changes',
            '/api/v1/info',
            '/api/v1/listens',
        ],
    );
    assert.deepEqual(f.publications[1], []);
    f.connection.disconnect();
});

test('instance, generation and retention changes force new complete copies', async () => {
    for (const change of [
        { instance_id: 'instance-b' },
        { generation: 'generation-b' },
        { revision: 4, retained_from: 2 },
    ]) {
        const f = fixture([
            F.info(),
            F.page(),
            F.info(change),
            F.page({ ...change, items: [], sync_cursor: 'new' }),
        ]);
        await f.connection.connect(credentials);
        assert.equal(await f.connection.sync(), true);
        assert.equal(f.requests.at(-1).url.pathname, '/api/v1/listens');
        assert.equal(f.publications.at(-1).length, 0);
        f.connection.disconnect();
    }
});

test('disconnect ignores even an abort-resistant late response and erases key, cursors and timers', async () => {
    const late = deferred();
    const f = fixture([F.info(), () => late.promise]);
    const running = f.connection.connect(credentials);
    while (f.requests.length < 2) await new Promise(setImmediate);
    const conn = f.connection.connection;
    f.connection.setAutomatic(true, 30);
    f.connection.disconnect();
    assert.equal(conn.key, '');
    assert.equal(conn.controller.signal.aborted, true);
    assert.equal(f.connection.copy, null);
    assert.equal(f.connection.timer, null);
    late.resolve(F.json(F.page()));
    assert.equal(await running, false);
    assert.equal(f.publications.length, 0);
    assert.equal(f.connection.active, false);
});

test('reconnecting cannot publish an earlier instance or reset its active synchronization', async () => {
    const late = deferred();
    const f = fixture([
        () => late.promise,
        F.info({ instance_id: 'new' }),
        F.page({ instance_id: 'new', items: [F.listen('new')] }),
    ]);
    const first = f.connection.connect(credentials);
    while (!f.requests.length) await new Promise(setImmediate);
    assert.equal(
        await f.connection.connect({ ...credentials, url: 'https://other.example' }),
        true,
    );
    late.resolve(F.json(F.info()));
    assert.equal(await first, false);
    assert.deepEqual(
        f.publications.map((rows) => rows[0].scrobbl.id),
        ['new'],
    );
    assert.equal(f.connection.copy.instance, 'new');
    f.connection.disconnect();
});

for (const [name, broken] of [
    ['duplicate ID', { items: [F.listen('a')] }],
    ['mixed revision', { revision: 2, items: [] }],
    ['mixed generation', { generation: 'another', items: [] }],
    ['mixed snapshot', { snapshot_id: 'another', items: [] }],
    ['mixed selection', { selection: { ...F.selection, until_ms: 1 }, items: [] }],
    ['invalid duration', { items: [F.listen('b', { listened_ms: null })] }],
    ['missing completion checkpoint', { sync_cursor: null, items: [] }],
    [
        'repeated continuation',
        { complete: false, next_cursor: 'repeat', sync_cursor: null, items: [] },
    ],
])
    test(`partial copy rejects ${name} without publishing`, async () => {
        const f = fixture([
            F.info(),
            F.page({ complete: false, next_cursor: 'repeat', sync_cursor: null }),
            F.page(broken),
        ]);
        assert.equal(await f.connection.connect(credentials), false);
        assert.equal(f.publications.length, 0);
        assert.equal(f.connection.copy, null);
        assert.equal(f.states.findLast((s) => s.status)?.status, 'error');
        f.connection.disconnect();
    });

test('unsupported version or units are rejected before requesting or publishing listens', async () => {
    for (const change of [
        { api_version: 2 },
        { duration_unit: 'seconds' },
        { timestamp_unit: 'seconds' },
    ]) {
        const f = fixture([F.info(change)]);
        assert.equal(await f.connection.connect(credentials), false);
        assert.equal(f.publications.length, 0);
        assert.equal(f.requests.length, 1);
        f.connection.disconnect();
    }
});

test('revocation between pages stops automatic updates and never exposes server messages or keys', async () => {
    const denied = deferred();
    const f = fixture([
        F.info(),
        F.page({ complete: false, next_cursor: 'b', sync_cursor: null }),
        () => denied.promise,
    ]);
    const loading = f.connection.connect(credentials);
    while (f.requests.length < 3) await new Promise(setImmediate);
    f.connection.setAutomatic(true, 30);
    denied.resolve(F.json({ error: { code: 'invalid_key', message: credentials.key } }, 401));
    assert.equal(await loading, false);
    assert.equal(f.connection.active, false);
    assert.equal(f.connection.automatic, false);
    assert.equal(f.connection.timer, null);
    assert.equal(f.publications.length, 0);
    assert.ok(!JSON.stringify(f.states).includes(credentials.key));
});

test('Retry-After applies to subsequent manual attempts and can be cancelled while waiting', async () => {
    const f = fixture([
        {
            status: 429,
            body: { error: { code: 'rate_limited' } },
            headers: { 'Retry-After': '90' },
        },
    ]);
    assert.equal(await f.connection.connect(credentials), false);
    assert.ok(f.connection.notBefore >= Date.now() + 89000);
    const waiting = f.connection.sync();
    await new Promise(setImmediate);
    assert.equal(f.requests.length, 1);
    f.connection.disconnect();
    assert.equal(await waiting, false);
});

test('network errors remain generic, timeouts are bounded and failed publication preserves checkpoint', async () => {
    const f = fixture([
        () => {
            throw new TypeError('sensitive-network-detail');
        },
    ]);
    assert.equal(await f.connection.connect(credentials), false);
    assert.match(f.states.findLast((s) => s.status)?.detail, /DNS.*CORS/);
    assert.ok(!JSON.stringify(f.states).includes('sensitive-network-detail'));
    f.connection.disconnect();
    const c = new Connection({
        retries: 0,
        timeout: 5,
        fetch: (_, { signal }) =>
            new Promise((_, reject) =>
                signal.addEventListener('abort', () => reject(new DOMException('', 'AbortError'))),
            ),
    });
    assert.equal(await c.connect(credentials), false);
    assert.ok(c.notBefore > Date.now());
    c.disconnect();
    const p = fixture([F.info(), F.page()]);
    p.connection.publish = () => {
        throw new Error('render failed');
    };
    assert.equal(await p.connection.connect(credentials), false);
    assert.equal(p.connection.copy, null);
    assert.equal(p.connection.lastSuccess, null);
    p.connection.disconnect();
});
