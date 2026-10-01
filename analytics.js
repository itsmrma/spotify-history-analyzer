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
                // Keep measured Spotify time over an estimated ListenBrainz duration.
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

    function analyze(entries) {
        const artists = new Map();
        const tracks = new Map();
        let totalMs = 0;
        let totalPlays = 0;
        let estimatedPlays = 0;
        let firstDate = null;
        let lastDate = null;
        for (const raw of entries) {
            const entry = normalizeEntry(raw);
            if (!entry) continue;
            const { artist, track, ms, date, estimated } = entry;
            totalPlays++;
            totalMs += ms;
            if (estimated) estimatedPlays++;
            if (!artists.has(artist))
                artists.set(artist, { name: artist, count: 0, ms: 0, dates: new Set() });
            const artistStat = artists.get(artist);
            artistStat.count++;
            artistStat.ms += ms;
            if (date) {
                artistStat.dates.add(date);
                if (!firstDate || date < firstDate) firstDate = date;
                if (!lastDate || date > lastDate) lastDate = date;
            }
            const key = JSON.stringify([track, artist]);
            if (!tracks.has(key)) tracks.set(key, { track, artist, count: 0, ms: 0 });
            const trackStat = tracks.get(key);
            trackStat.count++;
            trackStat.ms += ms;
        }
        const sortedTracks = [...tracks.values()].sort(
            (a, b) => b.count - a.count || b.ms - a.ms || a.track.localeCompare(b.track),
        );
        const sortedArtists = [...artists.values()].sort(
            (a, b) => b.count - a.count || a.name.localeCompare(b.name),
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
        };
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
        };
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
        formatTime,
    };
});
