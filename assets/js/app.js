'use strict';

const A = window.HistoryAnalytics;
const I = window.HistoryInsights;
const $ = (id) => document.getElementById(id);
if (window.Chart) Chart.defaults.font.family = 'Inter, system-ui, sans-serif';
let globalData = [];
let stats = null;
let artistsChart = null;
let importing = false;
let lbController = null;

function showMessage(text, kind = 'success') {
    $('app-message').textContent = text;
    $('app-message').dataset.kind = kind;
    $('app-message').classList.remove('hidden');
}

function setTab(name, focus = false) {
    for (const tab of ['analyze', 'lb']) {
        const selected = name === tab;
        const button = $(`tab-${tab}-btn`);
        button.classList.toggle('is-active', selected);
        button.setAttribute('aria-selected', String(selected));
        button.tabIndex = selected ? 0 : -1;
        $(`view-${tab}`).classList.toggle('hidden', !selected);
        if (selected && focus) button.focus();
    }
    if (name === 'analyze')
        requestAnimationFrame(() => {
            if (artistsChart) artistsChart.resize();
            I.resizeCharts();
        });
}

for (const name of ['analyze', 'lb']) {
    $(`tab-${name}-btn`).addEventListener('click', () => setTab(name));
    $(`tab-${name}-btn`).addEventListener('keydown', (event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const next =
            event.key === 'Home'
                ? 'analyze'
                : event.key === 'End'
                  ? 'lb'
                  : name === 'analyze'
                    ? 'lb'
                    : 'analyze';
        setTab(next, true);
    });
}

function updateBusyControls() {
    const busy = importing || lbController !== null;
    for (const id of ['choose-files-btn', 'add-files-btn', 'lb-integrate-btn', 'lb-download-btn'])
        $(id).disabled = busy;
    $('export-rankings-btn').disabled = busy || !stats?.totalPlays;
    $('file-upload').disabled = busy;
}

for (const id of ['choose-files-btn', 'add-files-btn'])
    $(id).addEventListener('click', () => $('file-upload').click());
$('file-upload').addEventListener('change', (event) => handleFiles(event.target.files));
$('upload-section').addEventListener('dragover', (event) => {
    event.preventDefault();
    if (!importing && !lbController) $('upload-section').classList.add('drag-over');
});
$('upload-section').addEventListener('dragleave', (event) => {
    if (!$('upload-section').contains(event.relatedTarget))
        $('upload-section').classList.remove('drag-over');
});
$('upload-section').addEventListener('drop', (event) => {
    event.preventDefault();
    $('upload-section').classList.remove('drag-over');
    handleFiles(event.dataTransfer.files);
});
// Avoid navigating away and losing the dashboard when a file is dropped outside the drop zone.
for (const type of ['dragover', 'drop'])
    window.addEventListener(type, (event) => {
        if (Array.from(event.dataTransfer?.types || []).includes('Files')) event.preventDefault();
    });

async function handleFiles(fileList) {
    const files = Array.from(fileList);
    if (!files.length || importing || lbController) return;
    importing = true;
    updateBusyControls();
    setTab('analyze');
    $('upload-section').classList.add('hidden');
    $('dashboard').classList.add('hidden');
    $('loading-section').classList.remove('hidden');
    $('app-message').classList.add('hidden');
    const incoming = [];
    const warnings = [];
    let parsedFiles = 0;

    async function readJSON(text, name) {
        try {
            const data = JSON.parse(text.replace(/^\uFEFF/, ''));
            if (!Array.isArray(data)) throw new Error('Expected a listening-history array');
            // Append without spreading: large exports can exceed the argument limit.
            for (const entry of data) incoming.push(entry);
            parsedFiles++;
        } catch (_) {
            warnings.push(`Could not read ${name}.`);
        }
        $('loading-text').textContent = `Reading your history · ${parsedFiles} JSON files`;
        await new Promise((resolve) => setTimeout(resolve, 0));
    }

    try {
        for (const file of files) {
            const name = file.name.toLowerCase();
            if (name.endsWith('.zip')) {
                try {
                    if (!window.JSZip) throw new Error('ZIP library unavailable');
                    const zip = await JSZip.loadAsync(file);
                    const jsonFiles = Object.values(zip.files).filter(
                        (item) =>
                            !item.dir &&
                            /\.json$/i.test(item.name) &&
                            !item.name.includes('__MACOSX/'),
                    );
                    if (!jsonFiles.length) warnings.push(`No JSON files in ${file.name}.`);
                    for (const item of jsonFiles)
                        await readJSON(await item.async('string'), item.name);
                } catch (_) {
                    warnings.push(
                        `Could not open ${file.name}. Please try the extracted JSON files.`,
                    );
                }
            } else if (name.endsWith('.json')) {
                try {
                    await readJSON(await file.text(), file.name);
                } catch (_) {
                    warnings.push(`Could not read ${file.name}.`);
                }
            } else warnings.push(`Unsupported file: ${file.name}. Use ZIP or JSON.`);
        }
        const merged = A.mergeEntries(globalData, incoming);
        if (!incoming.some((entry) => A.normalizeEntry(entry))) {
            showMessage(
                `No supported music plays of at least 30 seconds were found. ${warnings.join(' ')}`,
                'error',
            );
            return;
        }
        globalData = merged.entries;
        renderDashboard();
        const details = [];
        if (merged.duplicates)
            details.push(`${merged.duplicates.toLocaleString()} duplicate plays ignored.`);
        if (merged.skipped)
            details.push(
                `${merged.skipped.toLocaleString()} short or unsupported entries ignored.`,
            );
        showMessage(
            `History updated · ${globalData.length.toLocaleString()} music plays. ${details.join(' ')} ${warnings.join(' ')}`.trim(),
            warnings.length ? 'warning' : 'success',
        );
    } catch (error) {
        showMessage(
            `Could not import your history: ${error.message}. Your previous data is still available.`,
            'error',
        );
    } finally {
        importing = false;
        $('file-upload').value = '';
        $('loading-section').classList.add('hidden');
        $('dashboard').classList.toggle('hidden', !stats);
        $('upload-section').classList.toggle('hidden', Boolean(stats));
        updateBusyControls();
    }
}

function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function formatDate(date) {
    return new Intl.DateTimeFormat(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
    }).format(new Date(date));
}

function renderDashboard() {
    let filters = I.getFilters();
    stats = A.analyze(globalData, filters);
    if (I.updateYears(stats)) {
        filters = I.getFilters();
        stats = A.analyze(globalData, filters);
    }
    $('upload-section').classList.add('hidden');
    $('dashboard').classList.remove('hidden');
    $('total-tracks-stat').textContent = stats.totalPlays.toLocaleString();
    $('total-artists-stat').textContent = stats.artists.size.toLocaleString();
    $('total-time-stat').textContent = A.formatTime(stats.totalMs);
    $('time-caption').textContent = stats.estimatedPlays
        ? `Includes ${stats.estimatedPlays.toLocaleString()} estimated durations`
        : 'Total listening time';
    $('history-summary').textContent = stats.firstDate
        ? `${formatDate(stats.firstDate)} – ${formatDate(stats.lastDate)} · ${stats.sortedTracks.length.toLocaleString()} unique songs · UTC`
        : stats.totalPlays
          ? 'No valid timestamps available for streaks.'
          : 'No plays in the selected period.';
    if (stats.historyLastDate && !$('lb-date').value) {
        const nextDay = new Date(`${stats.historyLastDate}T00:00:00Z`);
        nextDay.setUTCDate(nextDay.getUTCDate() + 1);
        const suggested = nextDay.toISOString().slice(0, 10);
        if (suggested <= $('lb-date').max) $('lb-date').value = suggested;
    }
    renderArtistsChart();
    const streakList = $('global-streaks-list');
    streakList.replaceChildren();
    for (const [index, streak] of stats.streaks.slice(0, 5).entries()) {
        const item = element('li', 'streak-item');
        const info = element('div', 'streak-info');
        info.append(
            element('span', 'streak-name', streak.artist),
            element(
                'span',
                'streak-dates',
                `${formatDate(streak.start)} – ${formatDate(streak.end)}`,
            ),
        );
        const length = element('span', 'streak-length', `${streak.length} `);
        length.append(element('small', '', 'days'));
        item.append(element('span', 'rank', String(index + 1)), info, length);
        streakList.append(item);
    }
    if (!stats.streaks.length)
        streakList.append(
            element('li', 'empty-state', 'No consecutive-day streaks yet. Keep the music going!'),
        );
    renderTopSongs();
    I.render(stats, filters);
    updateBusyControls();
    if ($('artist-search-input').value.trim()) searchArtist();
    else $('artist-results').classList.add('hidden');
}

function renderTopSongs() {
    if (!stats) return;
    const fragment = document.createDocumentFragment();
    for (const [index, song] of stats.sortedTracks
        .slice(0, Number($('songs-limit-select').value))
        .entries()) {
        const row = element('tr');
        const title = element('td', 'song-title', song.track);
        title.title = song.track;
        row.append(
            element('td', '', String(index + 1)),
            title,
            element('td', 'song-artist', song.artist),
            element('td', 'numeric song-plays', song.count.toLocaleString()),
            element('td', 'numeric muted', A.formatTime(song.ms)),
        );
        fragment.append(row);
    }
    $('top-songs-table').replaceChildren(fragment);
    if (!stats.sortedTracks.length) {
        const cell = element('td', 'empty-state', 'No songs in this period.');
        cell.colSpan = 5;
        const row = element('tr');
        row.append(cell);
        $('top-songs-table').append(row);
    }
}

function renderArtistsChart() {
    const top = stats.sortedArtists.slice(0, 10);
    $('artistsChart').parentElement.style.height = `${Math.max(150, 32 + top.length * 28)}px`;
    const fallback = $('artists-chart-fallback');
    fallback.replaceChildren(
        ...top.map((artist) =>
            (() => {
                const item = element('li');
                const button = element(
                    'button',
                    'artist-song artist-link',
                    `${artist.name} · ${artist.count.toLocaleString()} plays`,
                );
                button.type = 'button';
                button.addEventListener('click', () => exploreArtist(artist.name));
                item.append(button);
                return item;
            })(),
        ),
    );
    // A compact, keyboard-accessible artist picker also accompanies the canvas.
    fallback.className = 'artist-picker';
    $('artistsChart').parentElement.classList.toggle('hidden', !window.Chart);
    if (!window.Chart) return;
    if (artistsChart) artistsChart.destroy();
    $('artistsChart').setAttribute(
        'aria-label',
        `Top artists: ${top.map((artist) => `${artist.name}, ${I.getFilters().metric === 'ms' ? A.formatTime(artist.ms) : `${artist.count} plays`}`).join('; ')}`,
    );
    artistsChart = new Chart($('artistsChart'), {
        type: 'bar',
        data: {
            labels: top.map((artist) => artist.name),
            datasets: [
                {
                    label: I.getFilters().metric === 'ms' ? 'Hours' : 'Plays',
                    data: top.map((artist) =>
                        I.getFilters().metric === 'ms' ? artist.ms / 3600000 : artist.count,
                    ),
                    backgroundColor: top.map((_, index) => (index === 0 ? '#b4d9c2' : '#d0bcff')),
                    borderRadius: 5,
                    maxBarThickness: 18,
                },
            ],
        },
        options: {
            onClick: (_event, items) => {
                if (items.length) exploreArtist(top[items[0].index].name);
            },
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            animation: window.matchMedia('(prefers-reduced-motion: reduce)').matches
                ? false
                : { duration: 400 },
            plugins: {
                legend: { display: false },
                tooltip: { backgroundColor: '#49454f', padding: 12 },
            },
            scales: {
                x: {
                    beginAtZero: true,
                    grid: { color: '#49454f' },
                    border: { display: false },
                    ticks: {
                        color: '#cac4d0',
                        precision: I.getFilters().metric === 'ms' ? 1 : 0,
                        font: { size: 10 },
                    },
                },
                y: {
                    grid: { display: false },
                    border: { display: false },
                    ticks: {
                        color: '#e6e0e9',
                        font: { size: 11 },
                        callback: function (value) {
                            const label = this.getLabelForValue(value);
                            return label.length > 22 ? `${label.slice(0, 21)}…` : label;
                        },
                    },
                },
            },
        },
    });
}

function searchArtist() {
    if (!stats) return;
    const query = $('artist-search-input').value.trim().toLocaleLowerCase();
    $('search-message').classList.add('hidden');
    if (!query) {
        $('artist-results').classList.add('hidden');
        return;
    }
    const artist =
        stats.sortedArtists.find((item) => item.name.toLocaleLowerCase() === query) ||
        stats.sortedArtists.find((item) => item.name.toLocaleLowerCase().includes(query));
    if (!artist) {
        $('artist-results').classList.add('hidden');
        $('search-message').textContent =
            'No artist matches this name in your history. Try a different search.';
        $('search-message').classList.remove('hidden');
        return;
    }
    $('res-artist-name').textContent = artist.name;
    const streaks = A.getAllStreaks(artist.dates).sort((a, b) => b.length - a.length);
    const record = streaks[0];
    $('res-artist-streak').textContent = !record
        ? 'No valid listening dates available.'
        : record.length > 1
          ? `Your record: ${record.length} consecutive days · ${formatDate(record.start)} – ${formatDate(record.end)}`
          : 'Listened on individual days. No consecutive-day streak yet.';
    $('res-artist-facts').replaceChildren(
        element('span', '', `${artist.count.toLocaleString()} plays · ${A.formatTime(artist.ms)}`),
        element(
            'span',
            '',
            `${((artist.count / stats.totalPlays) * 100).toFixed(1)}% of this period's plays`,
        ),
        element(
            'span',
            '',
            `First seen in loaded history: ${stats.firstSeen.has(artist.name) ? formatDate(stats.firstSeen.get(artist.name)) : 'Date not recorded'}`,
        ),
        element(
            'span',
            '',
            `Last play in this period: ${artist.lastDate ? formatDate(artist.lastDate) : 'Date not recorded'}`,
        ),
    );
    const songs = stats.sortedTracks.filter((song) => song.artist === artist.name).slice(0, 10);
    $('res-artist-songs').replaceChildren(
        ...songs.map((song, index) => {
            const item = element('li', 'artist-song');
            item.append(
                element('span', 'artist-song-name', `${index + 1}. ${song.track}`),
                element('span', 'artist-song-count', `${song.count.toLocaleString()} plays`),
            );
            return item;
        }),
    );
    $('artist-results').classList.remove('hidden');
}

function exploreArtist(name) {
    $('artist-search-input').value = name;
    searchArtist();
    $('artist-explorer').scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
            ? 'instant'
            : 'smooth',
        block: 'start',
    });
    $('artist-search-input').focus({ preventScroll: true });
}

I.initialize(() => {
    if (stats) renderDashboard();
}, exploreArtist);

$('songs-limit-select').addEventListener('change', renderTopSongs);
$('artist-search-form').addEventListener('submit', (event) => {
    event.preventDefault();
    searchArtist();
});
$('artist-search-input').addEventListener('input', () => {
    $('search-message').classList.add('hidden');
    $('artist-results').classList.add('hidden');
});
$('lb-date').max = new Date().toISOString().slice(0, 10);
$('lb-form').addEventListener('submit', (event) => {
    event.preventDefault();
    fetchListenBrainz(event.submitter !== $('lb-download-btn'));
});
$('lb-cancel-btn').addEventListener('click', () => lbController?.abort());

function pause(ms, signal) {
    return new Promise((resolve, reject) => {
        if (signal.aborted) {
            reject(new DOMException('Cancelled', 'AbortError'));
            return;
        }
        const abort = () => {
            clearTimeout(timer);
            reject(new DOMException('Cancelled', 'AbortError'));
        };
        const timer = setTimeout(() => {
            signal.removeEventListener('abort', abort);
            resolve();
        }, ms);
        signal.addEventListener('abort', abort, { once: true });
    });
}

async function requestListens(url, signal) {
    for (let attempt = 0; attempt < 3; attempt++) {
        // Timeout includes receiving and parsing the response body.
        const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(30000)]);
        const response = await fetch(url, {
            headers: { Accept: 'application/json' },
            signal: requestSignal,
        });
        if (response.status === 429 && attempt < 2) {
            const retry = Number(response.headers.get('Retry-After'));
            const delay =
                Number.isFinite(retry) && retry > 0
                    ? Math.min(retry, 30) * 1000
                    : 2000 * (attempt + 1);
            $('lb-status').textContent = 'ListenBrainz is busy. Retrying shortly…';
            await pause(delay, signal);
            continue;
        }
        if (response.status === 404)
            throw new Error('This ListenBrainz user was not found. Check the username');
        if (!response.ok)
            throw new Error(
                `ListenBrainz returned HTTP ${response.status}. Please try again later`,
            );
        const data = await response.json();
        if (!Array.isArray(data.payload?.listens))
            throw new Error('ListenBrainz returned an unexpected response');
        return data.payload.listens;
    }
}

async function fetchListenBrainz(integrate) {
    if (lbController || importing) return;
    const username = $('lb-username').value.trim();
    const startDate = $('lb-date').value;
    if (!username || !A.validDate(startDate) || startDate > $('lb-date').max) {
        showMessage('Enter a username and a valid start date on or before today.', 'error');
        return;
    }
    const targetTs = Date.parse(`${startDate}T00:00:00Z`) / 1000;
    lbController = new AbortController();
    const signal = lbController.signal;
    updateBusyControls();
    $('lb-loading').classList.remove('hidden');
    $('lb-status').textContent = 'Contacting ListenBrainz…';
    $('app-message').classList.add('hidden');
    const incoming = [];
    let maxTs = null;
    try {
        while (true) {
            const url = new URL(
                `https://api.listenbrainz.org/1/user/${encodeURIComponent(username)}/listens`,
            );
            url.searchParams.set('count', '1000');
            if (maxTs !== null) url.searchParams.set('max_ts', maxTs);
            const listens = await requestListens(url.href, signal);
            if (!listens.length) break;
            let oldest = Infinity;
            for (const item of listens) {
                if (!Number.isSafeInteger(item?.listened_at) || item.listened_at <= 0) continue;
                oldest = Math.min(oldest, item.listened_at);
                if (item.listened_at < targetTs) continue;
                const entry = A.convertListen(item);
                if (entry) incoming.push(entry);
            }
            if (!Number.isFinite(oldest) || (maxTs !== null && oldest >= maxTs))
                throw new Error('ListenBrainz pagination did not advance. Please try again');
            $('lb-status').textContent = `Downloaded ${incoming.length.toLocaleString()} listens…`;
            if (oldest <= targetTs) break;
            maxTs = oldest; // The API documents max_ts as exclusive.
            await pause(1000, signal);
        }
        signal.throwIfAborted();
        if (!incoming.length) {
            showMessage('No listens were found on or after this date.', 'warning');
            return;
        }
        if (integrate) {
            const previousCount = globalData.length;
            const merged = A.mergeEntries(globalData, incoming);
            if (!merged.entries.length) {
                showMessage('No music plays of at least 30 seconds were found.', 'warning');
                return;
            }
            globalData = merged.entries;
            setTab('analyze');
            renderDashboard();
            showMessage(
                `${(globalData.length - previousCount).toLocaleString()} plays added from ListenBrainz.${merged.duplicates ? ` ${merged.duplicates.toLocaleString()} duplicate plays ignored.` : ''}`,
            );
        } else {
            const blob = new Blob([JSON.stringify(incoming, null, 2)], {
                type: 'application/json',
            });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `Streaming_History_ListenBrainz_${username.replace(/[^a-zA-Z0-9_-]/g, '_')}_${startDate}.json`;
            document.body.append(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            showMessage(
                `JSON downloaded · ${incoming.length.toLocaleString()} listens. Estimated durations are marked in the file.`,
            );
        }
    } catch (error) {
        if (signal.aborted)
            showMessage('Download cancelled. Your existing history is still available.', 'warning');
        else if (error.name === 'TimeoutError')
            showMessage('ListenBrainz took too long to respond. Please try again.', 'error');
        else
            showMessage(
                `Could not download listens: ${error.message}. Your existing history is still available.`,
                'error',
            );
    } finally {
        lbController = null;
        $('lb-loading').classList.add('hidden');
        updateBusyControls();
    }
}
