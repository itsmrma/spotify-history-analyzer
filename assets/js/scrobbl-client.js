/* scrobbl.rs v1: one in-memory connection and atomic, canonical archive copies. */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.ScrobblClient = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    const text = (value) => typeof value === 'string' && value.length > 0;
    const integer = (value) => Number.isSafeInteger(value) && value >= 0;
    const millis = (value) => Number.isSafeInteger(value) && Math.abs(value) <= 8640000000000000;
    const nullableTime = (value) => value === null || integer(value);
    const messages = {
        invalid_request: 'The server rejected this selection. Check the dates and API address.',
        invalid_key:
            'This key is invalid, expired or revoked. Create a new read key and reconnect.',
        forbidden: 'This key does not have permission to read the archive.',
        origin_not_allowed: 'Allow this site’s exact origin in scrobbl.rs Settings → API keys.',
        read_only: 'This connection requires the scrobbl.rs read API.',
        rate_limited: 'The server is limiting requests. Waiting before another attempt.',
        cursor_quota: 'The server has too many active copies. Waiting before another attempt.',
        snapshot_unavailable: 'The server cannot prepare a copy right now. Try again later.',
        server_error:
            'The server could not complete the request. Your last copy is still available.',
        version_incompatible:
            'The API version changed. A compatible scrobbl.rs v1 API is required.',
        malformed:
            'The server returned an incomplete or invalid response. Your last copy is unchanged.',
        network:
            'Could not reach scrobbl.rs. Check LAN/VPN, HTTPS certificate, DNS, allowed CORS origin and local-network permission. The browser may not reveal the cause.',
        timeout: 'The request timed out. Your last complete copy is still available.',
    };
    class ApiError extends Error {
        constructor(code, retryAfter = 0, transient = false) {
            super(messages[code] || messages.server_error);
            this.code = code;
            this.retryAfter = retryAfter;
            this.transient = transient;
        }
    }
    function invalid() {
        throw new ApiError('malformed');
    }
    function abort() {
        throw new DOMException('Connection ended', 'AbortError');
    }

    function apiBase(value) {
        let url;
        try {
            url = new URL(value);
        } catch {
            throw new Error('Enter a valid HTTPS scrobbl.rs API URL.');
        }
        const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
        if (
            (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) ||
            url.username ||
            url.password ||
            url.search ||
            url.hash ||
            !['/', '/api/v1', '/api/v1/'].includes(url.pathname)
        )
            throw new Error(
                'Use the HTTPS origin or /api/v1 URL shown in scrobbl.rs Settings → API keys. HTTP is allowed only on loopback for development.',
            );
        return `${url.origin}/api/v1/`;
    }

    function selectionFromDates(start, end) {
        const parse = (value) => {
            if (!value) return null;
            if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Choose valid UTC dates.');
            const ms = Date.parse(`${value}T00:00:00Z`);
            if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== value)
                throw new Error('Choose valid UTC dates.');
            return ms;
        };
        const from_ms = parse(start);
        const endMs = parse(end);
        const until_ms = endMs === null ? null : endMs + 86400000;
        if (from_ms !== null && until_ms !== null && from_ms >= until_ms)
            throw new Error('The UTC start date must be on or before the end date.');
        return { from_ms, until_ms, counted_only: false };
    }

    function validateListen(item) {
        if (
            !item ||
            !text(item.id) ||
            !text(item.track_id) ||
            !text(item.title) ||
            !millis(item.played_at_ms) ||
            typeof item.counted !== 'boolean' ||
            !['actual', 'estimated', 'unknown'].includes(item.duration_kind) ||
            !nullableTime(item.listened_ms) ||
            !nullableTime(item.track_duration_ms) ||
            (item.duration_kind === 'unknown') !== (item.listened_ms === null) ||
            !(item.album_id === null || text(item.album_id)) ||
            !(item.album === null || text(item.album)) ||
            !Array.isArray(item.artists) ||
            !Array.isArray(item.sources) ||
            !item.artists.every((artist) => artist && text(artist.id) && text(artist.name)) ||
            !item.sources.every(text)
        )
            invalid();
        return item;
    }

    function validateInfo(info) {
        if (
            info?.api_version !== 1 ||
            info.timestamp_unit !== 'unix_ms_utc' ||
            info.duration_unit !== 'ms'
        )
            throw new ApiError('version_incompatible');
        if (
            !text(info.instance_id) ||
            !text(info.generation) ||
            !integer(info.revision) ||
            !integer(info.retained_from) ||
            info.retained_from > info.revision
        )
            invalid();
        return info;
    }

    function wait(ms, signal) {
        return new Promise((resolve, reject) => {
            if (signal.aborted) {
                reject(new DOMException('Connection ended', 'AbortError'));
                return;
            }
            const done = () => {
                signal.removeEventListener('abort', cancel);
                resolve();
            };
            const timer = setTimeout(done, Math.min(ms, 2147483647));
            const cancel = () => {
                clearTimeout(timer);
                reject(new DOMException('Connection ended', 'AbortError'));
            };
            signal.addEventListener('abort', cancel, { once: true });
        });
    }

    class Connection {
        constructor({
            fetch: fetcher = globalThis.fetch,
            publish = () => {},
            state = () => {},
            timeout = 65000,
            retries = 2,
        } = {}) {
            this.fetch = (url, options) => fetcher(url, options);
            this.publish = publish;
            this.notify = state;
            this.timeout = timeout;
            this.retries = retries;
            this.connection = null;
            this.copy = null;
            this.running = null;
            this.timer = null;
            this.automatic = false;
            this.interval = 120;
            this.failures = 0;
            this.notBefore = 0;
            this.lastSuccess = null;
            this.epoch = 0;
        }
        get active() {
            return this.connection !== null;
        }
        emit(status, detail = '') {
            this.notify({
                status,
                detail,
                active: this.active,
                busy: this.running !== null,
                automatic: this.automatic,
                lastSuccess: this.lastSuccess,
            });
        }
        connect({ url, key, selection = selectionFromDates('', '') }) {
            const base = apiBase(url);
            if (!text(key?.trim()) || /[\r\n]/.test(key))
                throw new Error('Enter a valid read API key.');
            if (
                !selection ||
                ![selection.from_ms, selection.until_ms].every((v) => v === null || millis(v)) ||
                selection.counted_only !== false ||
                (selection.from_ms !== null &&
                    selection.until_ms !== null &&
                    selection.from_ms >= selection.until_ms)
            )
                throw new Error('Choose a valid UTC selection.');
            this.disconnect();
            this.connection = {
                base,
                key: key.trim(),
                selection: { ...selection },
                controller: new AbortController(),
            };
            this.lastSuccess = null;
            return this.sync();
        }
        disconnect() {
            this.epoch++;
            clearTimeout(this.timer);
            this.timer = null;
            this.connection?.controller.abort();
            if (this.connection) this.connection.key = '';
            this.connection = null;
            this.copy = null;
            this.running = null;
            this.automatic = false;
            this.failures = 0;
            this.notBefore = 0;
            this.emit(
                'disconnected',
                'Disconnected. The last loaded history remains on this page.',
            );
        }
        setAutomatic(enabled, seconds = this.interval) {
            if (!Number.isInteger(seconds) || seconds < 30 || seconds > 86400)
                throw new Error('Choose an interval from 30 to 86400 whole seconds.');
            this.interval = seconds;
            this.automatic = Boolean(enabled && this.active);
            this.schedule();
            this.emit(
                this.running ? 'syncing' : 'ready',
                this.automatic
                    ? 'Automatic updates enabled, including in the background when the browser allows.'
                    : 'Automatic updates off.',
            );
        }
        schedule() {
            clearTimeout(this.timer);
            this.timer = null;
            if (!this.automatic || !this.active || this.running) return;
            this.timer = setTimeout(
                () => this.sync(),
                Math.max(this.interval * 1000, this.notBefore - Date.now()),
            );
        }
        async request(route, params, conn) {
            for (let attempt = 0; ; attempt++) {
                try {
                    return await this.requestOnce(route, params, conn);
                } catch (error) {
                    if (!error.transient || attempt >= this.retries) throw error;
                    this.notBefore = Date.now() + Math.max(error.retryAfter, 5000 * 2 ** attempt);
                    this.emit('syncing', `${error.message} Retrying after a delay…`);
                }
            }
        }
        async requestOnce(route, params, conn) {
            const signal = conn.controller.signal;
            while (this.notBefore > Date.now()) await wait(this.notBefore - Date.now(), signal);
            if (signal.aborted) abort();
            const url = new URL(route, conn.base);
            for (const [key, value] of Object.entries(params))
                if (value !== null) url.searchParams.set(key, String(value));
            const controller = new AbortController();
            const cancel = () => controller.abort();
            signal.addEventListener('abort', cancel, { once: true });
            let timedOut = false;
            const timer = setTimeout(() => {
                timedOut = true;
                controller.abort();
            }, this.timeout);
            try {
                const response = await this.fetch(url.href, {
                    method: 'GET',
                    headers: { Authorization: `Bearer ${conn.key}` },
                    credentials: 'omit',
                    cache: 'no-store',
                    redirect: 'error',
                    referrerPolicy: 'no-referrer',
                    signal: controller.signal,
                });
                if (signal.aborted) abort();
                if (timedOut) throw new ApiError('timeout', 0, true);
                let body;
                try {
                    body = await response.json();
                } catch {
                    if (response.ok) throw new ApiError('malformed');
                }
                if (signal.aborted) abort();
                if (timedOut) throw new ApiError('timeout', 0, true);
                if (!response.ok) {
                    const raw = response.headers.get('Retry-After');
                    const retryAfter =
                        raw && /^\d+$/.test(raw)
                            ? Number(raw) * 1000
                            : Math.max(0, Date.parse(raw) - Date.now()) || 0;
                    const code =
                        response.status === 401
                            ? 'invalid_key'
                            : response.status === 403
                              ? body?.error?.code === 'origin_not_allowed'
                                  ? 'origin_not_allowed'
                                  : 'forbidden'
                              : body?.error?.code || 'server_error';
                    throw new ApiError(
                        code,
                        retryAfter,
                        response.status === 429 || response.status >= 500,
                    );
                }
                return body;
            } catch (error) {
                if (signal.aborted) abort();
                if (timedOut) throw new ApiError('timeout', 0, true);
                if (error instanceof ApiError) throw error;
                throw new ApiError('network', 0, true);
            } finally {
                clearTimeout(timer);
                signal.removeEventListener('abort', cancel);
            }
        }
        async load(conn, info, full, epoch) {
            const old = this.copy;
            const staged = full ? new Map() : new Map(old.items);
            let cursor = full ? null : old.cursor;
            let envelope = null;
            const seenCursors = new Set();
            const changedIds = new Set();
            let pages = 0;
            for (;;) {
                const params = cursor
                    ? { cursor, limit: 1000 }
                    : { ...conn.selection, limit: 1000 };
                const page = await this.request(full ? 'listens' : 'changes', params, conn);
                if (epoch !== this.epoch) abort();
                if (page?.api_version !== 1) throw new ApiError('version_incompatible');
                const selection = page.selection;
                if (
                    page.instance_id !== info.instance_id ||
                    page.generation !== info.generation ||
                    !integer(page.revision) ||
                    !integer(page.retained_from) ||
                    page.retained_from > page.revision ||
                    !text(page.snapshot_id) ||
                    !millis(page.expires_at_ms) ||
                    !selection ||
                    !['from_ms', 'until_ms', 'counted_only'].every(
                        (key) => selection[key] === conn.selection[key],
                    ) ||
                    !Array.isArray(page.items) ||
                    !Array.isArray(page.removed) ||
                    typeof page.complete !== 'boolean' ||
                    (full
                        ? page.from_revision !== null || page.removed.length > 0
                        : page.from_revision !== old.revision || page.revision < old.revision)
                )
                    invalid();
                const identity = JSON.stringify([
                    page.snapshot_id,
                    page.revision,
                    page.from_revision,
                    page.expires_at_ms,
                    page.retained_from,
                ]);
                if (envelope !== null && identity !== envelope) invalid();
                envelope = identity;
                if (
                    page.complete
                        ? page.next_cursor !== null || !text(page.sync_cursor)
                        : !text(page.next_cursor) || page.sync_cursor !== null
                )
                    invalid();
                for (const item of page.items) {
                    validateListen(item);
                    if (
                        changedIds.has(item.id) ||
                        (selection.from_ms !== null && item.played_at_ms < selection.from_ms) ||
                        (selection.until_ms !== null && item.played_at_ms >= selection.until_ms)
                    )
                        invalid();
                    changedIds.add(item.id);
                    staged.set(item.id, item);
                }
                if (!page.complete && page.items.length + page.removed.length === 0) invalid();
                for (const removal of page.removed) {
                    if (
                        !removal ||
                        !text(removal.id) ||
                        !(removal.replacement_id === null || text(removal.replacement_id)) ||
                        changedIds.has(removal.id)
                    )
                        invalid();
                    changedIds.add(removal.id);
                    staged.delete(removal.id);
                }
                this.emit(
                    'syncing',
                    `Receiving ${full ? 'archive' : 'changes'} · ${++pages} pages · ${changedIds.size.toLocaleString()} records`,
                );
                if (page.complete)
                    return {
                        items: staged,
                        cursor: page.sync_cursor,
                        revision: page.revision,
                        instance: page.instance_id,
                        generation: page.generation,
                    };
                cursor = page.next_cursor;
                if (seenCursors.has(cursor)) invalid();
                seenCursors.add(cursor);
            }
        }
        sync() {
            if (!this.active) return Promise.resolve(false);
            if (this.running) return this.running;
            clearTimeout(this.timer);
            const epoch = this.epoch;
            const conn = this.connection;
            // Start in a microtask so all callers observe the same in-flight operation.
            this.running = Promise.resolve()
                .then(async () => {
                    this.emit(
                        'syncing',
                        this.notBefore > Date.now()
                            ? 'Waiting before retrying…'
                            : 'Checking the archive…',
                    );
                    try {
                        let info = validateInfo(await this.request('info', {}, conn));
                        if (epoch !== this.epoch) abort();
                        const full =
                            !this.copy ||
                            this.copy.instance !== info.instance_id ||
                            this.copy.generation !== info.generation ||
                            this.copy.revision < info.retained_from;
                        let next;
                        try {
                            next = await this.load(conn, info, full, epoch);
                        } catch (error) {
                            if (!['cursor_invalid', 'version_incompatible'].includes(error.code))
                                throw error;
                            this.emit(
                                'syncing',
                                'The archive copy or checkpoint changed. Loading a new complete copy…',
                            );
                            info = validateInfo(await this.request('info', {}, conn));
                            if (epoch !== this.epoch) abort();
                            next = await this.load(conn, info, true, epoch);
                        }
                        if (epoch !== this.epoch) abort();
                        const entries = [...next.items.values()]
                            .sort(
                                (a, b) =>
                                    a.played_at_ms - b.played_at_ms || a.id.localeCompare(b.id),
                            )
                            .map((item) => ({ scrobbl: item }));
                        this.publish(entries);
                        if (epoch !== this.epoch) abort();
                        this.copy = next;
                        this.lastSuccess = Date.now();
                        this.failures = 0;
                        this.notBefore = 0;
                        this.emit(
                            'ready',
                            `Complete copy · ${entries.length.toLocaleString()} canonical listens. Short listens remain in history; statistics use the server’s countability.`,
                        );
                        return true;
                    } catch (error) {
                        if (epoch !== this.epoch || error.name === 'AbortError') return false;
                        if (
                            error.code === 'invalid_key' ||
                            error.code === 'forbidden' ||
                            error.code === 'origin_not_allowed'
                        ) {
                            this.automatic = false;
                            conn.key = '';
                            conn.controller.abort();
                            this.connection = null;
                            this.copy = null;
                        } else if (error.transient) {
                            this.notBefore =
                                Date.now() +
                                Math.max(
                                    error.retryAfter,
                                    Math.min(300000, 5000 * 2 ** Math.min(this.failures++, 6)),
                                );
                        } else this.automatic = false;
                        this.emit(
                            'error',
                            error instanceof ApiError ? error.message : messages.malformed,
                        );
                        return false;
                    }
                })
                .finally(() => {
                    if (epoch !== this.epoch) return;
                    this.running = null;
                    this.notify({
                        busy: false,
                        active: this.active,
                        automatic: this.automatic,
                        lastSuccess: this.lastSuccess,
                    });
                    this.schedule();
                });
            return this.running;
        }
    }
    return { Connection, ApiError, apiBase, selectionFromDates, validateListen };
});
