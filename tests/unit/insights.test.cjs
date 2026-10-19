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
test('first recorded artist dates use the oldest UTC date and update when older files are added', () => {
    const recent = [
        play('A', 'Recent', '2026-03-01T12:00:00Z'),
        play('A', 'Earlier', '2025-12-31T23:30:00-02:00'),
        play('A', 'Undated', null),
    ];
    assert.equal(A.analyze(recent).firstSeen.get('A'), '2026-01-01');
    const older = play('A', 'Old export', '2024-02-29T12:00:00Z');
    for (const data of [
        [older, ...recent],
        [...recent, older],
    ]) {
        const stats = A.analyze(data, { startDate: '2026-01-01', endDate: '2026-10-19' });
        assert.equal(stats.firstSeen.get('A'), '2024-02-29');
        assert.deepEqual(stats.discoveries, []);
    }
});

test('scrobbler collaborations retain individual first dates instead of creating new discoveries', () => {
    const spotify = [
        play('Artist A', 'One', '2024-05-01T12:00:00Z'),
        play('Artist B', 'Two', '2025-01-01T12:00:00Z'),
    ];
    const joint = A.convertMaloja({
        time: Date.parse('2026-10-18T12:00:00Z') / 1000,
        track: { artists: ['Artist A', 'Artist B'], title: 'Together' },
    });
    for (const entry of [joint, { ...joint, artist_names: undefined }]) {
        for (const data of [
            [...spotify, entry],
            [entry, ...spotify],
        ]) {
            const stats = A.analyze(data);
            assert.deepEqual(stats.discoveries, [
                { artist: 'Artist B', date: '2025-01-01' },
                { artist: 'Artist A', date: '2024-05-01' },
            ]);
            assert.equal(stats.totalPlays, 3);
            assert.equal(stats.sortedTracks.length, 3);
            assert.deepEqual(A.analyze(data, { startDate: '2026-01-01' }).discoveries, []);
        }
    }
});

test('an earlier collaboration contributes to each artist even without solo plays in the period', () => {
    const joint = A.convertMaloja({
        time: Date.parse('2024-01-01T12:00:00Z') / 1000,
        track: { artists: ['Artist A', 'Artist B'], title: 'Together' },
    });
    const stats = A.analyze([joint, play('Artist A', 'Solo', '2025-01-01T12:00:00Z')], {
        startDate: '2024-01-01',
        endDate: '2024-12-31',
    });
    assert.deepEqual(stats.discoveries, [
        { artist: 'Artist A', date: '2024-01-01' },
        { artist: 'Artist B', date: '2024-01-01' },
    ]);
});

test('structured credits belong to their play without relabeling earlier solo plays', () => {
    const stats = A.analyze([
        play('Artist A', 'Solo', '2020-01-01T12:00:00Z'),
        play('Artist A', 'With guest', '2024-01-01T12:00:00Z', 60000, {
            source: 'listenbrainz',
            artist_names: ['Artist A', 'Guest'],
        }),
    ]);
    assert.equal(stats.firstSeen.get('Artist A'), '2020-01-01');
    assert.equal(stats.firstSeen.get('Guest'), '2024-01-01');
});

test('literal commas and unknown artist credits are preserved', () => {
    const entries = [
        play('Artist A', 'Solo', '2024-01-01T12:00:00Z'),
        play('Artist B', 'Solo', '2024-01-01T12:00:00Z'),
        play('Artist A, Artist B', 'Band', '2025-01-01T12:00:00Z'),
        { ...play('Unknown, Artist B', 'Together', '2026-01-01T12:00:00Z'), source: 'lastfm' },
    ];
    const credits = A.artistCredits(entries);
    assert.deepEqual(credits.get('Artist A, Artist B'), ['Artist A, Artist B']);
    assert.deepEqual(credits.get('Unknown, Artist B'), ['Unknown, Artist B']);
    const structured = A.convertMaloja({
        time: Date.parse('2026-01-02T12:00:00Z') / 1000,
        track: { artists: ['Artist A, Artist B', 'Guest'], title: 'Together' },
    });
    assert.deepEqual(
        A.artistCredits([...entries, structured]).get(structured.master_metadata_album_artist_name),
        ['Artist A, Artist B', 'Guest'],
    );
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
