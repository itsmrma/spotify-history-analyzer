/* Search the complete local history without applying dashboard filters. */
window.HistoryExplorer = (() => {
    'use strict';
    const A = window.HistoryAnalytics;
    const $ = (id) => document.getElementById(id);
    const pageSize = 100;
    const indexes = { artist: new Map(), album: new Map(), song: new Map() };
    let history = null;
    let suggestions = [];
    let matches = [];
    let selected = null;
    let active = -1;
    let page = 0;
    let timer = null;
    let hasData = false;
    const searchText = (value) =>
        value
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLocaleLowerCase();
    const number = (value) => value.toLocaleString();
    const plays = (count) => `${number(count)} ${count === 1 ? 'play' : 'plays'}`;
    function node(tag, text, className) {
        const result = document.createElement(tag);
        if (text !== undefined) result.textContent = text;
        if (className) result.className = className;
        return result;
    }

    function closeSuggestions() {
        $('history-suggestions').classList.add('hidden');
        $('history-search-input').setAttribute('aria-expanded', 'false');
        $('history-search-input').removeAttribute('aria-activedescendant');
        active = -1;
    }

    function showSuggestions() {
        const query = searchText($('history-search-input').value.trim());
        matches = [];
        closeSuggestions();
        $('history-suggestions').replaceChildren();
        if (!query || !hasData) return;
        for (const group of suggestions) {
            if (group.search.includes(query)) matches.push(group);
            if (matches.length === 8) break;
        }
        if (!matches.length) {
            $('history-search-message').textContent = 'No matching names in your loaded history.';
            return;
        }
        for (const [index, group] of matches.entries()) {
            const item = node('li', undefined, 'history-suggestion');
            item.id = `history-option-${index}`;
            item.setAttribute('role', 'option');
            item.setAttribute('aria-selected', 'false');
            item.append(
                node('strong', group.label),
                node(
                    'span',
                    `${group.artist ? `${group.artist} · ` : ''}${plays(group.records.length)}`,
                    'muted',
                ),
            );
            item.addEventListener('mousedown', (event) => event.preventDefault());
            item.addEventListener('click', () => choose(group));
            $('history-suggestions').append(item);
        }
        $('history-suggestions').classList.remove('hidden');
        $('history-search-input').setAttribute('aria-expanded', 'true');
        $('history-search-message').textContent = 'Choose a suggestion to see every matching play.';
    }

    function setActive(index) {
        active = (index + matches.length) % matches.length;
        for (const [position, item] of Array.from($('history-suggestions').children).entries())
            item.setAttribute('aria-selected', String(position === active));
        const option = $(`history-option-${active}`);
        $('history-search-input').setAttribute('aria-activedescendant', option.id);
        option.scrollIntoView({ block: 'nearest' });
    }

    function choose(group) {
        clearTimeout(timer);
        selected = group;
        page = 0;
        $('history-search-input').value = group.label;
        closeSuggestions();
        $('history-results').classList.remove('hidden');
        $('history-result-title').textContent = group.label;
        $('history-result-artist').textContent = group.artist || '';
        $('history-result-summary').textContent =
            `${plays(group.records.length)} · ${A.formatTime(group.ms)} · Complete loaded history, newest first · UTC${group.estimated ? ` · ${number(group.estimated)} estimated durations` : ''}`;
        $('history-search-message').textContent = 'Showing all matching plays, 100 per page.';
        renderPage();
    }

    function duration(ms) {
        const seconds = Math.floor(ms / 1000);
        return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`;
    }

    function extraDetails(raw, record) {
        const values = [
            ['Shuffle', record.shuffle],
            ['Offline', record.offline],
            ['Country', raw.conn_country],
            ['Started by', raw.reason_start],
            ['Ended by', raw.reason_end],
            ['Skipped', raw.skipped],
            ['Incognito', raw.incognito_mode],
            ['Duration estimated', record.estimated ? true : null],
        ].filter(([, value]) => value !== null && value !== undefined && value !== '');
        if (!values.length) return node('span', 'Not recorded', 'muted');
        const details = node('details');
        details.append(node('summary', 'More'));
        const list = node('dl', undefined, 'history-metadata');
        for (const [label, value] of values)
            list.append(
                node('dt', label),
                node('dd', typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)),
            );
        details.append(list);
        return details;
    }

    function renderPage() {
        if (!selected) return;
        const start = page * pageSize;
        const fragment = document.createDocumentFragment();
        for (const record of selected.records.slice(start, start + pageSize)) {
            const row = node('tr');
            const sourceNames = {
                listenbrainz: 'ListenBrainz',
                lastfm: 'Last.fm',
                maloja: 'Maloja',
            };
            const source = sourceNames[record.raw.source] || record.raw.source || 'Spotify';
            for (const value of [
                record.date ? A.formatInputDate(record.date) : 'Not recorded',
                record.timestamp ? record.timestamp.slice(11, 19) : 'Not recorded',
                record.track,
                record.artist,
                record.album || 'Not recorded',
                `${duration(record.ms)}${record.estimated ? ' (estimated)' : ''}`,
                record.platform || 'Not recorded',
                source,
            ])
                row.append(node('td', value));
            const cell = node('td');
            cell.append(extraDetails(record.raw, record));
            row.append(cell);
            fragment.append(row);
        }
        $('history-plays').replaceChildren(fragment);
        const total = selected.records.length;
        $('history-page-summary').textContent =
            `Plays ${number(start + 1)}–${number(Math.min(start + pageSize, total))} of ${number(total)} · Page ${number(page + 1)} of ${number(Math.ceil(total / pageSize))}`;
        $('history-prev').disabled = page === 0;
        $('history-next').disabled = start + pageSize >= total;
    }

    function queueSearch() {
        clearTimeout(timer);
        closeSuggestions();
        selected = null;
        $('history-results').classList.add('hidden');
        $('history-search-message').textContent = hasData
            ? 'Type a name to search your complete history.'
            : 'Upload your listening history in Your history to search your plays.';
        timer = setTimeout(showSuggestions, 500);
    }

    function setHistory(entries) {
        if (history === entries) return;
        history = entries;
        const previousKey = selected?.key;
        for (const index of Object.values(indexes)) index.clear();
        const records = [];
        for (const raw of entries) {
            const record = A.normalizeEntry(raw);
            if (record) records.push({ ...record, raw });
        }
        records.sort((a, b) =>
            a.timestamp && b.timestamp
                ? b.timestamp.localeCompare(a.timestamp)
                : a.timestamp
                  ? -1
                  : b.timestamp
                    ? 1
                    : 0,
        );
        hasData = records.length > 0;
        const add = (type, label, artist, record) => {
            const key = JSON.stringify([label, artist]);
            let group = indexes[type].get(key);
            if (!group) {
                group = {
                    key,
                    label,
                    artist,
                    search: searchText(`${label} ${artist || ''}`),
                    records: [],
                    ms: 0,
                    estimated: 0,
                };
                indexes[type].set(key, group);
            }
            group.records.push(record);
            group.ms += record.ms;
            if (record.estimated) group.estimated++;
        };
        for (const record of records) {
            add('artist', record.artist, null, record);
            add('song', record.track, record.artist, record);
            if (record.album) add('album', record.album, record.artist, record);
        }
        updateType();
        const previous = previousKey && indexes[$('history-search-type').value].get(previousKey);
        if (previous) choose(previous);
    }

    function updateType() {
        suggestions = [...indexes[$('history-search-type').value].values()].sort(
            (a, b) =>
                b.records.length - a.records.length ||
                a.label.localeCompare(b.label) ||
                (a.artist || '').localeCompare(b.artist || ''),
        );
        queueSearch();
    }

    $('history-search-input').addEventListener('input', queueSearch);
    $('history-search-input').addEventListener('blur', closeSuggestions);
    $('history-search-type').addEventListener('change', updateType);
    $('history-search-input').addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            clearTimeout(timer);
            closeSuggestions();
        } else if (
            ['ArrowDown', 'ArrowUp'].includes(event.key) &&
            matches.length &&
            $('history-search-input').getAttribute('aria-expanded') === 'true'
        ) {
            event.preventDefault();
            setActive(
                active < 0
                    ? event.key === 'ArrowDown'
                        ? 0
                        : matches.length - 1
                    : active + (event.key === 'ArrowDown' ? 1 : -1),
            );
        } else if (event.key === 'Enter' && active >= 0) {
            event.preventDefault();
            choose(matches[active]);
        }
    });
    $('history-search-form').addEventListener('submit', (event) => {
        event.preventDefault();
        clearTimeout(timer);
        showSuggestions();
        const query = searchText($('history-search-input').value.trim());
        const exact = suggestions.filter((group) => searchText(group.label) === query);
        if (exact.length === 1) choose(exact[0]);
    });
    for (const [id, step] of [
        ['history-prev', -1],
        ['history-next', 1],
    ])
        $(id).addEventListener('click', () => {
            if (!selected) return;
            page = Math.max(
                0,
                Math.min(Math.ceil(selected.records.length / pageSize) - 1, page + step),
            );
            renderPage();
        });
    setHistory([]);
    return { setHistory };
})();
