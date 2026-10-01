const { test } = require('node:test');
const assert = require('node:assert/strict');
const A = require('../analytics.js');
const play = (artist, track, ts = '2026-03-01T12:00:00Z', ms = 60000) => ({
    master_metadata_album_artist_name: artist,
    master_metadata_track_name: track,
    ts,
    ms_played: ms,
});

test('malformed records and nonnumeric durations do not poison counts', () => {
    const result = A.analyze([
        null,
        42,
        {},
        [],
        play('A', 'T', undefined, '60000'),
        play('A', 'T', undefined, Infinity),
        play('A', 'T', undefined, 29999),
        play('A', 'T', undefined, 30000),
    ]);
    assert.equal(result.totalPlays, 1);
    assert.equal(result.totalMs, 30000);
    assert.equal(A.normalizeEntry({ ...play('A', 'T'), ms_played: 0, msPlayed: 60000 }), null);
});
test('basic Spotify format is supported and treated as UTC', () => {
    const entry = A.normalizeEntry({
        artistName: ' A ',
        trackName: ' T ',
        msPlayed: 60000,
        endTime: '2026-03-01 12:30',
    });
    assert.equal(entry.artist, 'A');
    assert.equal(entry.timestamp, '2026-03-01T12:30:00.000Z');
});
test('artist names cannot collide with object prototypes or track delimiters', () => {
    const result = A.analyze([
        play('__proto__', 'x'),
        play('constructor', 'x'),
        play('C', 'A:::B'),
        play('B:::C', 'A'),
    ]);
    assert.equal(result.artists.size, 4);
    assert.equal(result.sortedTracks.length, 4);
});
test('streaks ignore invalid dates, deduplicate days and cross leap days and DST', () => {
    const streaks = A.getAllStreaks([
        'invalid',
        '2024-02-30',
        '2024-02-28',
        '2024-02-29',
        '2024-03-01',
        '2024-03-01',
        '2024-03-30',
        '2024-03-31',
        '2024-04-01',
    ]);
    assert.deepEqual(
        streaks.map((streak) => streak.length),
        [3, 3],
    );
    assert.equal(A.normalizeEntry(play('A', 'T', '2024-02-30T12:00:00Z')).date, null);
    assert.equal(A.normalizeEntry(play('A', 'T', '2026-03-01T23:30:00-02:00')).date, '2026-03-02');
});
test('reimport is idempotent and measured durations replace estimates', () => {
    const estimated = { ...play('A', 'T', undefined, 180000), duration_estimated: true };
    const measured = play('A', 'T', undefined, 120000);
    const merged = A.mergeEntries([estimated], [measured, measured]);
    assert.equal(merged.entries.length, 1);
    assert.equal(merged.duplicates, 2);
    assert.equal(A.analyze(merged.entries).totalMs, 120000);
    const noDate = play('A', 'T', 'invalid');
    assert.equal(A.mergeEntries([noDate], [noDate]).entries.length, 2);
});
test('ListenBrainz conversion uses known durations and marks fallback estimates', () => {
    const listen = {
        listened_at: 1772366400,
        track_metadata: {
            artist_name: 'A',
            track_name: 'T',
            additional_info: { duration_ms: 123456 },
        },
    };
    assert.equal(A.convertListen(listen).ms_played, 123456);
    assert.equal(A.convertListen(listen).duration_estimated, false);
    listen.track_metadata.additional_info = { duration: 150 };
    assert.equal(A.convertListen(listen).ms_played, 150000);
    listen.track_metadata.additional_info = {};
    assert.equal(A.convertListen(listen).duration_estimated, true);
    assert.equal(A.convertListen({ ...listen, listened_at: undefined }), null);
});
test('large histories can be merged without argument stack overflow', () => {
    const result = A.mergeEntries(
        [],
        Array.from({ length: 150000 }, (_, i) =>
            play('A', 'T', new Date(1700000000000 + i * 60000).toISOString()),
        ),
    );
    assert.equal(result.entries.length, 150000);
    assert.equal(A.analyze(result.entries).totalPlays, 150000);
});
