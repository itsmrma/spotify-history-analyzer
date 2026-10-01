const { test } = require('node:test');
const assert = require('node:assert/strict');
const A = require('../../assets/js/analytics.js');
const play = (artist, track, ts, ms = 60000, extra = {}) => ({
    master_metadata_album_artist_name: artist,
    master_metadata_track_name: track,
    ts,
    ms_played: ms,
    ...extra,
});

test('date filters include both boundary days and exclude plays without valid timestamps', () => {
    const data = [
        play('A', 'First', '2025-12-31T23:59:59Z'),
        play('A', 'Start', '2026-01-01T00:00:00Z'),
        play('B', 'End', '2026-12-31T23:59:59Z'),
        play('B', 'Later', '2027-01-01T00:00:00Z'),
        play('A', 'Undated', null),
    ];
    const all = A.analyze(data);
    const selected = A.analyze(data, { startDate: '2026-01-01', endDate: '2026-12-31' });
    assert.equal(all.totalPlays, 5);
    assert.equal(selected.totalPlays, 2);
    assert.equal(selected.undatedPlays, 1);
    assert.deepEqual(selected.availableYears, ['2027', '2026', '2025']);
    assert.equal(selected.historyFirstDate, '2025-12-31');
    assert.equal(selected.historyLastDate, '2027-01-01');
});
test('UTC hours, weekdays, daily records and streaks aggregate across artists', () => {
    const data = [
        play('A', 'Repeat', '2026-03-01T23:00:00Z'),
        play('A', 'Repeat', '2026-03-01T23:05:00Z'),
        play('B', 'Other', '2026-03-02T01:00:00+01:00'),
        play('C', 'Another', '2026-03-03T12:00:00Z'),
    ];
    const stats = A.analyze(data);
    assert.equal(stats.hours[23].count, 2);
    assert.equal(stats.hours[0].count, 1);
    assert.equal(stats.weekdays[6].count, 2);
    assert.equal(stats.weekdays[0].count, 1);
    assert.equal(stats.days.size, 3);
    assert.equal(stats.sortedDays[0].date, '2026-03-01');
    assert.equal(stats.listeningStreaks[0].length, 3);
    assert.equal(stats.streaks.length, 0);
    assert.equal(stats.averageActiveDayMs, 80000);
    assert.equal(stats.repeatShare, 0.25);
    assert.equal(stats.mostRepeatedDay.count, 2);
});
test('ranking by time changes artists, songs and albums without altering counts', () => {
    const data = [
        play('A', 'One', '2026-03-01T12:00:00Z', 60000, {
            master_metadata_album_album_name: 'Shared name',
        }),
        play('A', 'One', '2026-03-02T12:00:00Z', 60000, {
            master_metadata_album_album_name: 'Shared name',
        }),
        play('B', 'Long', '2026-03-01T15:00:00Z', 600000, {
            master_metadata_album_album_name: 'Shared name',
        }),
    ];
    const plays = A.analyze(data);
    const time = A.analyze(data, { metric: 'ms' });
    assert.equal(plays.sortedArtists[0].name, 'A');
    assert.equal(time.sortedArtists[0].name, 'B');
    assert.equal(time.sortedTracks[0].track, 'Long');
    assert.equal(time.sortedAlbums[0].artist, 'B');
    assert.equal(time.sortedAlbums.length, 2);
    assert.equal(time.totalPlays, plays.totalPlays);
    assert.equal(time.totalMs, plays.totalMs);
});
test('artist discoveries use first appearance in all imported history, regardless of filter', () => {
    const data = [
        play('Old', 'T', '2025-01-01T12:00:00Z'),
        play('Old', 'T', '2026-03-01T12:00:00Z'),
        play('New', 'T', '2026-03-01T12:00:00Z'),
        play('Undated', 'T', null),
    ];
    const stats = A.analyze(data, { startDate: '2026-01-01', endDate: '2026-12-31' });
    assert.deepEqual(stats.discoveries, [{ artist: 'New', date: '2026-03-01' }]);
    assert.equal(stats.firstSeen.get('Old'), '2025-01-01');
});
test('monthly timeline includes empty months and crosses the year boundary', () => {
    const stats = A.analyze([
        play('A', 'T', '2025-12-01T12:00:00Z'),
        play('A', 'T', '2026-02-01T12:00:00Z'),
    ]);
    const timeline = A.monthlyTimeline(stats);
    assert.deepEqual(
        timeline.map((month) => month.period),
        ['2025-12', '2026-01', '2026-02'],
    );
    assert.deepEqual(
        timeline.map((month) => month.count),
        [1, 0, 1],
    );
    assert.equal(
        A.monthlyTimeline(stats, { startDate: '2026-01-01', endDate: '2026-12-31' }).length,
        12,
    );
    assert.deepEqual(
        A.monthlyTimeline(stats, { startDate: '2026-03-01', endDate: '2026-01-01' }),
        [],
    );
    assert.deepEqual(A.monthlyTimeline(A.analyze([])), []);
});
test('shuffle and offline statistics use only plays with known boolean metadata', () => {
    const data = [
        play('A', 'T', '2026-03-01T12:00:00Z', 60000, {
            shuffle: true,
            offline: false,
            platform: 'android',
        }),
        play('A', 'T', '2026-03-02T12:00:00Z', 60000, { shuffle: false, offline: true }),
        play('A', 'T', '2026-03-03T12:00:00Z', 60000, { shuffle: 'false', offline: 1 }),
    ];
    const stats = A.analyze(data);
    assert.equal(stats.shuffleKnown, 2);
    assert.equal(stats.shuffled, 1);
    assert.equal(stats.offlineKnown, 2);
    assert.equal(stats.offline, 1);
    assert.deepEqual(stats.platforms, [
        ['Not recorded', 2],
        ['android', 1],
    ]);
});
test('CSV escapes quotes, commas and spreadsheet formulas and exports all ranked songs', () => {
    const stats = A.analyze([
        play('=SUM(1,2)', 'A "quoted", song', '2026-03-01T12:00:00Z'),
        play('@artist', ' +formula', '2026-03-02T12:00:00Z'),
    ]);
    const csv = A.rankingCSV(stats);
    assert.ok(csv.includes('A ""quoted"", song'));
    assert.ok(csv.includes("'=SUM(1,2)"));
    assert.ok(csv.includes("'@artist"));
    assert.ok(csv.includes("'+formula"));
    assert.equal(csv.split('\r\n').length, 3);
    assert.equal(A.rankingCSV(A.analyze([])), 'Rank,Song,Artist,Plays,Listening time (ms)');
});
