/* Shared, DOM-free analysis. Exported for both the browser and regression tests. */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.HistoryAnalytics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    const DAY_MS = 86400000;

    function validDate(value) {
        if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
        const date = new Date(`${value}T00:00:00Z`);
        return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
    }

    function normalizeEntry(entry) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
        const artist = entry.master_metadata_album_artist_name ?? entry.artistName;
        const track = entry.master_metadata_track_name ?? entry.trackName;
        const ms = entry.ms_played ?? entry.msPlayed ?? 0;
        if (
            typeof artist !== 'string' ||
            !artist.trim() ||
            typeof track !== 'string' ||
            !track.trim() ||
            typeof ms !== 'number' ||
            !Number.isFinite(ms) ||
            ms < 30000
        )
            return null;
        const rawTimestamp = entry.ts ?? entry.endTime;
        let timestamp = null;
        let date = null;
        if (typeof rawTimestamp === 'string' && validDate(rawTimestamp.slice(0, 10))) {
            // Basic Spotify exports use a UTC timestamp without the Z suffix.
            const iso = rawTimestamp.replace(' ', 'T');
            const withZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(iso) ? iso : `${iso}Z`;
            const parsed = new Date(withZone);
            if (Number.isFinite(parsed.getTime())) {
                timestamp = parsed.toISOString();
                date = timestamp.slice(0, 10);
            }
        }
        return {
            artist: artist.trim(),
            track: track.trim(),
            ms,
            date,
            timestamp,
            estimated: entry.duration_estimated === true,
            album:
                typeof entry.master_metadata_album_album_name === 'string' &&
                entry.master_metadata_album_album_name.trim()
                    ? entry.master_metadata_album_album_name.trim()
                    : null,
            platform:
                typeof entry.platform === 'string' && entry.platform.trim()
                    ? entry.platform.trim()
                    : null,
            shuffle: typeof entry.shuffle === 'boolean' ? entry.shuffle : null,
            offline: typeof entry.offline === 'boolean' ? entry.offline : null,
        };
    }

    function mergeEntries(existing, incoming) {
        const entries = [];
        const seen = new Map();
        let duplicates = 0;
        let skipped = 0;
        for (const raw of [...existing, ...incoming]) {
            const entry = normalizeEntry(raw);
            if (!entry) {
                skipped++;
                continue;
            }
            // Without a complete timestamp there is no reliable way to identify a duplicate.
            const key = entry.timestamp
                ? JSON.stringify([entry.timestamp, entry.artist, entry.track])
                : null;
            if (key && seen.has(key)) {
                duplicates++;
                // Keep measured Spotify time over an estimated scrobbler duration.
                const index = seen.get(key);
                if (entries[index].duration_estimated === true && !entry.estimated)
                    entries[index] = raw;
                continue;
            }
            if (key) seen.set(key, entries.length);
            entries.push(raw);
        }
        return { entries, duplicates, skipped };
    }

    function getAllStreaks(listeningDates) {
        const dates = [...new Set(listeningDates)].filter(validDate).sort();
        const streaks = [];
        for (const value of dates) {
            const date = new Date(`${value}T00:00:00Z`);
            const last = streaks[streaks.length - 1];
            if (last && date - last.end === DAY_MS) {
                last.end = date;
                last.length++;
            } else streaks.push({ start: date, end: date, length: 1 });
        }
        return streaks;
    }

    function analyze(entries, options = {}) {
        const artists = new Map();
        const tracks = new Map();
        const albums = new Map();
        const days = new Map();
        const months = new Map();
        const years = new Map();
        const firstSeen = new Map();
        const availableYears = new Set();
        const records = [];
        const weekdays = Array.from({ length: 7 }, () => ({ count: 0, ms: 0 }));
        const hours = Array.from({ length: 24 }, () => ({ count: 0, ms: 0 }));
        const platforms = new Map();
        let shuffleKnown = 0;
        let shuffled = 0;
        let offlineKnown = 0;
        let offline = 0;
        let undatedPlays = 0;
        let historyFirstDate = null;
        let historyLastDate = null;
        let totalMs = 0;
        let totalPlays = 0;
        let estimatedPlays = 0;
        let firstDate = null;
        let lastDate = null;
        for (const raw of entries) {
            const entry = normalizeEntry(raw);
            if (!entry) continue;
            const { artist, track, ms, date, estimated, album, platform } = entry;
            if (date) {
                availableYears.add(date.slice(0, 4));
                if (!firstSeen.has(artist) || date < firstSeen.get(artist))
                    firstSeen.set(artist, date);
                if (!historyFirstDate || date < historyFirstDate) historyFirstDate = date;
                if (!historyLastDate || date > historyLastDate) historyLastDate = date;
            } else undatedPlays++;
            if (
                (options.startDate || options.endDate) &&
                (!date ||
                    (options.startDate && date < options.startDate) ||
                    (options.endDate && date > options.endDate))
            )
                continue;
            records.push(entry);
            totalPlays++;
            totalMs += ms;
            if (estimated) estimatedPlays++;
            if (!artists.has(artist))
                artists.set(artist, {
                    name: artist,
                    count: 0,
                    ms: 0,
                    dates: new Set(),
                    firstDate: null,
                    lastDate: null,
                });
            const artistStat = artists.get(artist);
            artistStat.count++;
            artistStat.ms += ms;
            if (date) {
                artistStat.dates.add(date);
                if (!artistStat.firstDate || date < artistStat.firstDate)
                    artistStat.firstDate = date;
                if (!artistStat.lastDate || date > artistStat.lastDate) artistStat.lastDate = date;
                if (!firstDate || date < firstDate) firstDate = date;
                if (!lastDate || date > lastDate) lastDate = date;
            }
            const key = JSON.stringify([track, artist]);
            if (!tracks.has(key))
                tracks.set(key, {
                    track,
                    artist,
                    count: 0,
                    ms: 0,
                    firstDate: null,
                    lastDate: null,
                });
            const trackStat = tracks.get(key);
            trackStat.count++;
            trackStat.ms += ms;
            if (date) {
                if (!trackStat.firstDate || date < trackStat.firstDate) trackStat.firstDate = date;
                if (!trackStat.lastDate || date > trackStat.lastDate) trackStat.lastDate = date;
                if (!days.has(date))
                    days.set(date, {
                        date,
                        count: 0,
                        ms: 0,
                        artists: new Map(),
                        tracks: new Map(),
                    });
                const day = days.get(date);
                day.count++;
                day.ms += ms;
                day.artists.set(artist, (day.artists.get(artist) || 0) + 1);
                if (!day.tracks.has(key)) day.tracks.set(key, { artist, track, count: 0, ms: 0 });
                day.tracks.get(key).count++;
                day.tracks.get(key).ms += ms;
                for (const [map, period] of [
                    [months, date.slice(0, 7)],
                    [years, date.slice(0, 4)],
                ]) {
                    if (!map.has(period))
                        map.set(period, { period, count: 0, ms: 0, artists: new Map() });
                    const stat = map.get(period);
                    stat.count++;
                    stat.ms += ms;
                    stat.artists.set(artist, (stat.artists.get(artist) || 0) + 1);
                }
                const timestamp = new Date(entry.timestamp);
                const weekday = (timestamp.getUTCDay() + 6) % 7;
                weekdays[weekday].count++;
                weekdays[weekday].ms += ms;
                hours[timestamp.getUTCHours()].count++;
                hours[timestamp.getUTCHours()].ms += ms;
            }
            if (album) {
                const albumKey = JSON.stringify([album, artist]);
                if (!albums.has(albumKey))
                    albums.set(albumKey, { album, artist, count: 0, ms: 0, tracks: new Set() });
                const albumStat = albums.get(albumKey);
                albumStat.count++;
                albumStat.ms += ms;
                albumStat.tracks.add(track);
            }
            platforms.set(
                platform || 'Not recorded',
                (platforms.get(platform || 'Not recorded') || 0) + 1,
            );
            if (entry.shuffle !== null) {
                shuffleKnown++;
                if (entry.shuffle) shuffled++;
            }
            if (entry.offline !== null) {
                offlineKnown++;
                if (entry.offline) offline++;
            }
        }
        const byRank = (a, b) =>
            options.metric === 'ms'
                ? b.ms - a.ms || b.count - a.count
                : b.count - a.count || b.ms - a.ms;
        const sortedTracks = [...tracks.values()].sort(
            (a, b) => byRank(a, b) || a.track.localeCompare(b.track),
        );
        const sortedArtists = [...artists.values()].sort(
            (a, b) => byRank(a, b) || a.name.localeCompare(b.name),
        );
        const streaks = [];
        for (const artist of sortedArtists) {
            for (const streak of getAllStreaks(artist.dates)) {
                if (streak.length > 1) streaks.push({ artist: artist.name, ...streak });
            }
        }
        streaks.sort(
            (a, b) => b.length - a.length || b.end - a.end || a.artist.localeCompare(b.artist),
        );
        const sortedDays = [...days.values()].sort(
            (a, b) => b.count - a.count || b.ms - a.ms || a.date.localeCompare(b.date),
        );
        const listeningStreaks = getAllStreaks(days.keys()).sort(
            (a, b) => b.length - a.length || b.end - a.end,
        );
        const discoveries = [...firstSeen]
            .filter(
                ([artist, date]) =>
                    artists.has(artist) &&
                    (!options.startDate || date >= options.startDate) &&
                    (!options.endDate || date <= options.endDate),
            )
            .map(([artist, date]) => ({ artist, date }))
            .sort((a, b) => b.date.localeCompare(a.date) || a.artist.localeCompare(b.artist));
        let mostRepeatedDay = null;
        for (const day of days.values()) {
            for (const song of day.tracks.values()) {
                if (
                    !mostRepeatedDay ||
                    song.count > mostRepeatedDay.count ||
                    (song.count === mostRepeatedDay.count && day.date < mostRepeatedDay.date)
                )
                    mostRepeatedDay = { ...song, date: day.date };
            }
        }
        return {
            artists,
            sortedArtists,
            sortedTracks,
            streaks,
            totalMs,
            totalPlays,
            estimatedPlays,
            firstDate,
            lastDate,
            records,
            days,
            months,
            years,
            hours,
            weekdays,
            firstSeen,
            historyFirstDate,
            historyLastDate,
            undatedPlays,
            availableYears: [...availableYears].sort().reverse(),
            sortedAlbums: [...albums.values()].sort(
                (a, b) => byRank(a, b) || a.album.localeCompare(b.album),
            ),
            sortedDays,
            listeningStreaks,
            discoveries,
            mostRepeatedDay,
            repeatShare: totalPlays ? (totalPlays - tracks.size) / totalPlays : 0,
            averageActiveDayMs: days.size
                ? [...days.values()].reduce((sum, day) => sum + day.ms, 0) / days.size
                : 0,
            platforms: [...platforms].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
            shuffleKnown,
            shuffled,
            offlineKnown,
            offline,
        };
    }

    function monthlyTimeline(stats, options = {}) {
        const start = options.startDate || stats.firstDate;
        const end = options.endDate || stats.lastDate;
        if (!start || !end || !validDate(start) || !validDate(end) || start > end) return [];
        const startMonth = Number(start.slice(0, 4)) * 12 + Number(start.slice(5, 7)) - 1;
        const endMonth = Number(end.slice(0, 4)) * 12 + Number(end.slice(5, 7)) - 1;
        // Bound rendering for malformed exports or accidentally huge custom ranges.
        if (endMonth - startMonth > 1200) return [];
        return Array.from({ length: endMonth - startMonth + 1 }, (_, index) => {
            const value = startMonth + index;
            const period = `${String(Math.floor(value / 12)).padStart(4, '0')}-${String((value % 12) + 1).padStart(2, '0')}`;
            return stats.months.get(period) || { period, count: 0, ms: 0, artists: new Map() };
        });
    }

    function rankingCSV(stats) {
        const cell = (value) => {
            let text = String(value);
            if (/^[\s]*[=+\-@\t\r\n]/.test(text)) text = `'${text}`;
            return `"${text.replace(/"/g, '""')}"`;
        };
        return [
            'Rank,Song,Artist,Plays,Listening time (ms)',
            ...stats.sortedTracks.map((song, index) =>
                [index + 1, song.track, song.artist, song.count, song.ms].map(cell).join(','),
            ),
        ].join('\r\n');
    }

    function convertListen(item) {
        if (!item || !Number.isSafeInteger(item.listened_at) || item.listened_at <= 0) return null;
        const metadata = item.track_metadata;
        if (
            !metadata ||
            typeof metadata.artist_name !== 'string' ||
            !metadata.artist_name.trim() ||
            typeof metadata.track_name !== 'string' ||
            !metadata.track_name.trim()
        )
            return null;
        const additional = metadata.additional_info || {};
        let duration =
            additional.duration_ms ??
            (typeof additional.duration === 'number' ? additional.duration * 1000 : null);
        const estimated =
            typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0;
        if (estimated) duration = 180000;
        const date = new Date(item.listened_at * 1000);
        if (!Number.isFinite(date.getTime())) return null;
        return {
            ts: date.toISOString().replace(/\.000Z$/, 'Z'),
            master_metadata_album_artist_name: metadata.artist_name.trim(),
            master_metadata_track_name: metadata.track_name.trim(),
            ms_played: duration,
            duration_estimated: estimated,
            source: 'listenbrainz',
            master_metadata_album_album_name:
                typeof metadata.release_name === 'string'
                    ? metadata.release_name.trim()
                    : undefined,
        };
    }

    function convertLastFM(item) {
        if (item?.['@attr']?.nowplaying === 'true') return null;
        const entry = convertListen({
            listened_at: Number(item?.date?.uts),
            track_metadata: {
                artist_name: item?.artist?.['#text'] ?? item?.artist?.name ?? item?.artist,
                track_name: item?.name,
                release_name: item?.album?.['#text'],
            },
        });
        if (entry) entry.source = 'lastfm';
        return entry;
    }

    function convertMaloja(item) {
        const artists = item?.track?.artists;
        if (
            !Array.isArray(artists) ||
            !artists.length ||
            artists.some((artist) => typeof artist !== 'string' || !artist.trim())
        )
            return null;
        const entry = convertListen({
            listened_at: item?.time,
            track_metadata: {
                artist_name: artists.join(', '),
                track_name: item?.track?.title,
                release_name: item?.track?.album?.albumtitle ?? item?.track?.album,
                additional_info: { duration: item?.duration },
            },
        });
        if (entry) entry.source = 'maloja';
        return entry;
    }

    function historyEntries(data) {
        const list = Array.isArray(data)
            ? data
            : (data?.payload?.listens ?? data?.recenttracks?.track ?? data?.list);
        if (!Array.isArray(list))
            throw new Error('Expected a listening-history array or scrobbler JSON export');
        return list.map((item) => {
            if (item?.track_metadata) return convertListen(item);
            if (item?.date?.uts || item?.['@attr']?.nowplaying) return convertLastFM(item);
            if (item?.track && typeof item.time === 'number') return convertMaloja(item);
            return item;
        });
    }

    function formatTime(ms) {
        const totalMinutes = Math.floor(ms / 60000);
        const hours = Math.floor(totalMinutes / 60);
        return hours ? `${hours.toLocaleString()}h ${totalMinutes % 60}m` : `${totalMinutes}m`;
    }
    return {
        validDate,
        normalizeEntry,
        mergeEntries,
        getAllStreaks,
        analyze,
        convertListen,
        convertLastFM,
        convertMaloja,
        historyEntries,
        formatTime,
        monthlyTimeline,
        rankingCSV,
    };
});
