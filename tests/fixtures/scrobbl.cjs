// Synthetic scrobbl.rs v1 data, shared by protocol and UI acceptance scenarios.
const selection = { from_ms: null, until_ms: null, counted_only: false };
const listen = (id = 'a', extra = {}) => ({
    id,
    played_at_ms: Date.parse('2026-03-29T00:30:00Z'),
    track_id: 'track-a',
    title: 'Archive song',
    album_id: 'album-a',
    album: 'Archive album',
    artists: [{ id: 'artist-a', name: 'Archive artist' }],
    track_duration_ms: 180000,
    listened_ms: 120000,
    duration_kind: 'actual',
    counted: true,
    sources: ['spotify', 'listenbrainz'],
    ...extra,
});
const info = (extra = {}) => ({
    api_version: 1,
    instance_id: 'instance-a',
    generation: 'generation-a',
    revision: 1,
    retained_from: 0,
    timestamp_unit: 'unix_ms_utc',
    duration_unit: 'ms',
    max_page_size: 1000,
    ...extra,
});
const page = (extra = {}) => ({
    api_version: 1,
    instance_id: 'instance-a',
    generation: 'generation-a',
    from_revision: null,
    revision: 1,
    retained_from: 0,
    snapshot_id: 'copy-a',
    expires_at_ms: Date.parse('2030-01-01T00:00:00Z'),
    selection: { ...selection },
    items: [listen()],
    removed: [],
    next_cursor: null,
    sync_cursor: 'checkpoint-a',
    complete: true,
    ...extra,
});
const json = (body, status = 200, headers = {}) =>
    new Response(JSON.stringify(body), { status, headers });
module.exports = { selection, listen, info, page, json };
