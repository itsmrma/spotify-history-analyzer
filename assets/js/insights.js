/* Dashboard controls and visualisations. All history remains in the browser. */
window.HistoryInsights = (() => {
    'use strict';
    const A = window.HistoryAnalytics;
    const $ = (id) => document.getElementById(id);
    const charts = new Map();
    const weekdayNames = [
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
        'Sunday',
    ];
    let currentStats = null;
    let currentFilters = {};
    let changeView = () => {};
    let openArtist = () => {};
    const number = (value) => value.toLocaleString();
    const percent = (value, total) => (total ? `${((value / total) * 100).toFixed(1)}%` : '0%');
    const dateLabel = (value) =>
        new Intl.DateTimeFormat(undefined, {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            timeZone: 'UTC',
        }).format(new Date(value));
    const monthLabel = (value) =>
        new Intl.DateTimeFormat(undefined, {
            month: 'short',
            year: 'numeric',
            timeZone: 'UTC',
        }).format(new Date(`${value}-01T00:00:00Z`));

    function node(tag, className, text) {
        const result = document.createElement(tag);
        if (className) result.className = className;
        if (text !== undefined) result.textContent = text;
        return result;
    }

    function getFilters() {
        const period = $('period-select').value;
        const metric = $('ranking-metric').value;
        if (period === 'custom') {
            if (
                !A.validDate($('filter-start').value) ||
                !A.validDate($('filter-end').value) ||
                $('filter-start').value > $('filter-end').value
            )
                return { ...currentFilters, metric };
            return { metric, startDate: $('filter-start').value, endDate: $('filter-end').value };
        }
        if (/^\d{4}$/.test(period))
            return { metric, startDate: `${period}-01-01`, endDate: `${period}-12-31` };
        return { metric };
    }

    function updateYears(stats) {
        const selected = $('period-select').value;
        const values = ['all', ...stats.availableYears, 'custom'];
        if (
            Array.from($('period-select').options, (option) => option.value).join() !==
            values.join()
        ) {
            $('period-select').replaceChildren(
                ...values.map((value) => {
                    const option = node(
                        'option',
                        '',
                        value === 'all'
                            ? 'All history'
                            : value === 'custom'
                              ? 'Custom dates'
                              : value,
                    );
                    option.value = value;
                    return option;
                }),
            );
            $('period-select').value = values.includes(selected) ? selected : 'all';
        }
        if (!$('filter-start').value && stats.historyFirstDate)
            $('filter-start').value = stats.historyFirstDate;
        if (!$('filter-end').value && stats.historyLastDate)
            $('filter-end').value = stats.historyLastDate;
        return selected !== $('period-select').value;
    }

    function applyFilters() {
        const custom = $('period-select').value === 'custom';
        $('custom-dates').classList.toggle('hidden', !custom);
        if (custom) {
            const startDate = $('filter-start').value;
            const endDate = $('filter-end').value;
            if (!A.validDate(startDate) || !A.validDate(endDate) || startDate > endDate) {
                $('filter-message').textContent =
                    'Choose valid start and end dates, with the start on or before the end.';
                $('filter-message').classList.add('filter-error');
                return;
            }
        }
        $('filter-message').classList.remove('filter-error');
        changeView();
    }

    function initialize(onChange, onArtist) {
        changeView = onChange;
        openArtist = onArtist;
        $('analysis-filters').addEventListener('submit', (event) => {
            event.preventDefault();
            applyFilters();
        });
        for (const id of ['period-select', 'ranking-metric'])
            $(id).addEventListener('change', applyFilters);
        $('reset-filters-btn').addEventListener('click', () => {
            $('period-select').value = 'all';
            $('ranking-metric').value = 'count';
            if (currentStats) {
                $('filter-start').value = currentStats.historyFirstDate || '';
                $('filter-end').value = currentStats.historyLastDate || '';
            }
            applyFilters();
        });
        $('calendar-year').addEventListener('change', renderCalendar);
        $('export-rankings-btn').addEventListener('click', () => {
            if (!currentStats?.totalPlays) return;
            const blob = new Blob(['\uFEFF', A.rankingCSV(currentStats)], {
                type: 'text/csv;charset=utf-8',
            });
            const url = URL.createObjectURL(blob);
            const link = node('a');
            const range = currentFilters.startDate
                ? `${currentFilters.startDate}_${currentFilters.endDate}`
                : 'all-history';
            link.href = url;
            link.download = `music-rankings_${range}_${currentFilters.metric === 'ms' ? 'time' : 'plays'}.csv`;
            document.body.append(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        });
    }

    function fact(label, value, detail, key) {
        const card = node('article', 'fact-card');
        card.dataset.fact = key;
        card.append(
            node('span', 'stat-label', label),
            node('strong', '', value),
            node('span', 'stat-caption', detail),
        );
        return card;
    }

    function renderFacts(stats) {
        const record = stats.sortedDays[0];
        const streak = stats.listeningStreaks[0];
        $('listening-facts').replaceChildren(
            fact(
                'Unique songs',
                number(stats.sortedTracks.length),
                'Different songs in this period',
                'unique-songs',
            ),
            fact(
                'Active days',
                number(stats.days.size),
                'Days with at least one recorded play',
                'active-days',
            ),
            fact(
                'Daily listening',
                stats.days.size ? A.formatTime(stats.averageActiveDayMs) : '—',
                'Average time per active day',
                'daily-average',
            ),
            fact(
                'Your busiest day',
                record ? dateLabel(record.date) : '—',
                record
                    ? `${number(record.count)} plays · ${A.formatTime(record.ms)}`
                    : 'Needs valid listening dates',
                'record-day',
            ),
            fact(
                'Longest listening streak',
                streak ? `${number(streak.length)} days` : '—',
                streak
                    ? `${dateLabel(streak.start)} – ${dateLabel(streak.end)} · Any artist`
                    : 'Needs valid listening dates',
                'listening-streak',
            ),
            fact(
                'Repeat plays',
                percent(stats.totalPlays - stats.sortedTracks.length, stats.totalPlays),
                'Plays beyond the first play of each song',
                'repeat-share',
            ),
        );
    }

    function makeChart(id, fallbackId, labels, values, options = {}) {
        const canvas = $(id);
        const fallback = $(fallbackId);
        const units = currentFilters.metric === 'ms' ? 'hours' : 'plays';
        fallback.replaceChildren(
            ...labels.map((label, index) =>
                node('p', '', `${label}: ${number(Math.round(values[index] * 10) / 10)} ${units}`),
            ),
        );
        fallback.className = window.Chart ? 'sr-only' : 'chart-fallback';
        canvas.parentElement.classList.toggle('hidden', !window.Chart || !labels.length);
        if (!labels.length) {
            fallback.className = 'empty-state';
            fallback.textContent = 'No dated plays available for this view.';
        }
        if (charts.has(id)) {
            charts.get(id).destroy();
            charts.delete(id);
        }
        if (!window.Chart || !labels.length) return;
        canvas.setAttribute(
            'aria-label',
            `${canvas.getAttribute('aria-label').split(':')[0]}: ${labels.map((label, index) => `${label}, ${number(Math.round(values[index] * 10) / 10)} ${units}`).join('; ')}`,
        );
        const chart = new Chart(canvas, {
            type: options.type || 'bar',
            data: {
                labels,
                datasets: [
                    {
                        label: units === 'hours' ? 'Hours' : 'Plays',
                        data: values,
                        borderColor: '#d0bcff',
                        backgroundColor:
                            options.type === 'line' ? 'rgba(208,188,255,.1)' : '#b4d9c2',
                        fill: options.type === 'line',
                        tension: 0.25,
                        pointRadius: labels.length > 36 ? 0 : 3,
                        borderRadius: 5,
                        maxBarThickness: 28,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: window.matchMedia('(prefers-reduced-motion: reduce)').matches
                    ? false
                    : { duration: 250 },
                plugins: {
                    legend: { display: false },
                    tooltip: { backgroundColor: '#49454f', padding: 12 },
                },
                scales: {
                    x: {
                        grid: { display: false },
                        border: { display: false },
                        ticks: {
                            color: '#cac4d0',
                            maxTicksLimit: options.maxTicks || 12,
                            maxRotation: 0,
                            font: { size: 10 },
                        },
                    },
                    y: {
                        beginAtZero: true,
                        grid: { color: '#49454f' },
                        border: { display: false },
                        ticks: {
                            color: '#cac4d0',
                            precision: units === 'hours' ? 1 : 0,
                            font: { size: 10 },
                        },
                    },
                },
                ...options.chartOptions,
            },
        });
        charts.set(id, chart);
    }

    function renderRhythm(stats) {
        const metricValue = (value) =>
            currentFilters.metric === 'ms' ? value.ms / 3600000 : value.count;
        const timeline = A.monthlyTimeline(stats, currentFilters);
        makeChart(
            'timelineChart',
            'timeline-fallback',
            timeline.map((item) => monthLabel(item.period)),
            timeline.map(metricValue),
            { type: 'line' },
        );
        $('timeline-total').textContent = `${number(stats.days.size)} active days`;
        const busiestMonth = [...stats.months.values()].sort(
            (a, b) => metricValue(b) - metricValue(a) || a.period.localeCompare(b.period),
        )[0];
        const peakDay = stats.weekdays.reduce(
            (best, day, index) =>
                metricValue(day) > metricValue(stats.weekdays[best]) ? index : best,
            0,
        );
        const peakHour = stats.hours.reduce(
            (best, hour, index) =>
                metricValue(hour) > metricValue(stats.hours[best]) ? index : best,
            0,
        );
        const highlights = [];
        if (busiestMonth) {
            highlights.push(
                node(
                    'span',
                    '',
                    `Peak month: ${monthLabel(busiestMonth.period)} · ${currentFilters.metric === 'ms' ? A.formatTime(busiestMonth.ms) : `${number(busiestMonth.count)} plays`}`,
                ),
            );
            highlights.push(node('span', '', `Favourite day: ${weekdayNames[peakDay]}`));
            highlights.push(
                node('span', '', `Peak hour: ${String(peakHour).padStart(2, '0')}:00 UTC`),
            );
        }
        $('timeline-highlights').replaceChildren(...highlights);
        makeChart(
            'weekdayChart',
            'weekday-fallback',
            stats.days.size ? weekdayNames.map((day) => day.slice(0, 3)) : [],
            stats.days.size ? stats.weekdays.map(metricValue) : [],
            { maxTicks: 7 },
        );
        makeChart(
            'hoursChart',
            'hours-fallback',
            stats.days.size
                ? stats.hours.map((_, index) => `${String(index).padStart(2, '0')}:00`)
                : [],
            stats.days.size ? stats.hours.map(metricValue) : [],
        );
    }

    function renderCalendar() {
        if (!currentStats) return;
        const calendar = $('activity-calendar');
        const months = $('calendar-months');
        calendar.replaceChildren();
        months.replaceChildren();
        const year = $('calendar-year').value;
        if (!year) {
            $('calendar-day-detail').textContent =
                'No valid listening dates available for the calendar.';
            return;
        }
        const start = new Date(`${year}-01-01T00:00:00Z`);
        const end = new Date(`${String(Number(year) + 1).padStart(4, '0')}-01-01T00:00:00Z`);
        const count = Math.round((end - start) / 86400000);
        const offset = (start.getUTCDay() + 6) % 7;
        const weeks = Math.ceil((offset + count) / 7);
        calendar.style.gridTemplateColumns = `repeat(${weeks}, 13px)`;
        months.style.gridTemplateColumns = `repeat(${weeks}, 13px)`;
        const yearDays = [...currentStats.days.values()].filter((day) => day.date.startsWith(year));
        const max = yearDays.reduce((best, day) => Math.max(best, day.count), 0);
        for (let i = 0; i < offset; i++) calendar.append(node('span', 'calendar-spacer'));
        const buttons = [];
        let focusIndex = 0;
        for (let index = 0; index < count; index++) {
            const dayDate = new Date(start.getTime() + index * 86400000);
            const date = dayDate.toISOString().slice(0, 10);
            const day = currentStats.days.get(date);
            const outside =
                (currentFilters.startDate && date < currentFilters.startDate) ||
                (currentFilters.endDate && date > currentFilters.endDate);
            if (dayDate.getUTCDate() === 1) {
                const label = node(
                    'span',
                    '',
                    new Intl.DateTimeFormat(undefined, { month: 'short', timeZone: 'UTC' }).format(
                        dayDate,
                    ),
                );
                label.style.gridColumn = `${Math.floor((offset + index) / 7) + 1} / span 3`;
                label.style.gridRow = '1';
                months.append(label);
            }
            const button = node('button', 'calendar-day');
            button.type = 'button';
            button.dataset.date = date;
            button.dataset.level = outside
                ? 'outside'
                : String(day ? Math.max(1, Math.ceil((day.count / max) * 4)) : 0);
            button.tabIndex = -1;
            button.setAttribute(
                'aria-label',
                `${dateLabel(date)} · ${outside ? 'Outside selected period' : `${number(day?.count || 0)} plays${day ? ` · ${A.formatTime(day.ms)}` : ''}`}`,
            );
            button.title = button.getAttribute('aria-label');
            button.addEventListener('click', () => {
                for (const item of buttons) {
                    item.tabIndex = -1;
                    item.classList.remove('is-selected');
                }
                button.tabIndex = 0;
                button.classList.add('is-selected');
                renderDay(date);
            });
            button.addEventListener('keydown', (event) => {
                const delta = {
                    ArrowLeft: -7,
                    ArrowRight: 7,
                    ArrowUp: -1,
                    ArrowDown: 1,
                    Home: -index,
                    End: count - index - 1,
                }[event.key];
                if (delta === undefined) return;
                event.preventDefault();
                const target = buttons[Math.max(0, Math.min(count - 1, index + delta))];
                button.tabIndex = -1;
                target.tabIndex = 0;
                target.focus();
            });
            if (day) focusIndex = index;
            buttons.push(button);
            calendar.append(button);
        }
        if (buttons.length) buttons[focusIndex].tabIndex = 0;
        $('calendar-day-detail').replaceChildren(
            node(
                'p',
                'muted',
                `${number(yearDays.length)} active days in ${year}. Select a cell to explore a day; use arrow keys to move around the calendar.`,
            ),
        );
    }

    function renderDay(date) {
        const detail = $('calendar-day-detail');
        const day = currentStats.days.get(date);
        const outside =
            (currentFilters.startDate && date < currentFilters.startDate) ||
            (currentFilters.endDate && date > currentFilters.endDate);
        detail.replaceChildren(node('strong', '', dateLabel(date)));
        if (!day) {
            detail.append(
                node(
                    'p',
                    'muted',
                    outside
                        ? 'This day is outside the selected period.'
                        : 'No recorded plays on this day.',
                ),
            );
            return;
        }
        detail.append(
            node(
                'p',
                'muted',
                `${number(day.count)} plays · ${A.formatTime(day.ms)} · ${number(day.artists.size)} artists`,
            ),
        );
        const list = node('ol', 'day-songs');
        for (const song of [...day.tracks.values()]
            .sort((a, b) => b.count - a.count || a.track.localeCompare(b.track))
            .slice(0, 3)) {
            list.append(
                node('li', '', `${song.track} — ${song.artist} · ${number(song.count)} plays`),
            );
        }
        detail.append(list);
    }

    function renderLibrary(stats) {
        const albums = $('top-albums-list');
        albums.replaceChildren();
        const albumPlays = stats.sortedAlbums.reduce((sum, album) => sum + album.count, 0);
        $('album-coverage').textContent = stats.totalPlays
            ? `Album names available for ${percent(albumPlays, stats.totalPlays)} of this period's plays.`
            : 'No plays in this period.';
        for (const [index, album] of stats.sortedAlbums.slice(0, 8).entries()) {
            const item = node('li', 'ranked-item');
            const info = node('div', 'ranked-info');
            info.append(
                node('strong', '', album.album),
                node('span', 'muted', `${album.artist} · ${album.tracks.size} songs`),
            );
            item.append(
                node('span', 'rank', String(index + 1)),
                info,
                node(
                    'span',
                    'ranked-value',
                    currentFilters.metric === 'ms'
                        ? A.formatTime(album.ms)
                        : `${number(album.count)} plays`,
                ),
            );
            albums.append(item);
        }
        if (!stats.sortedAlbums.length)
            albums.append(
                node(
                    'li',
                    'empty-state',
                    'Album names are not available in these files. Extended Spotify exports usually include them.',
                ),
            );
        $('discovery-count').textContent = number(stats.discoveries.length);
        $('discoveries-list').replaceChildren(
            ...stats.discoveries.slice(0, 8).map((discovery) => {
                const item = node('li', 'ranked-item');
                const button = node('button', 'discovery-link', discovery.artist);
                button.type = 'button';
                button.addEventListener('click', () => openArtist(discovery.artist));
                item.append(
                    button,
                    node('span', 'muted discovery-date', dateLabel(discovery.date)),
                );
                return item;
            }),
        );
        if (!stats.discoveries.length)
            $('discoveries-list').append(
                node(
                    'li',
                    'empty-state',
                    'No artists first appeared in this period of your loaded history.',
                ),
            );
    }

    function renderYears(stats) {
        const years = [...stats.years.values()].sort((a, b) => b.period.localeCompare(a.period));
        $('year-recaps').replaceChildren(
            ...years.map((year) => {
                const top = [...year.artists].sort(
                    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
                )[0];
                const card = node('article', 'year-card');
                card.append(
                    node('strong', 'year-number', year.period),
                    node('p', '', `${number(year.count)} plays · ${A.formatTime(year.ms)}`),
                    node(
                        'p',
                        'muted',
                        `${number(year.artists.size)} artists · Top by plays: ${top[0]}`,
                    ),
                );
                const button = node('button', 'year-link', `Explore ${year.period} →`);
                button.type = 'button';
                button.addEventListener('click', () => {
                    $('period-select').value = year.period;
                    applyFilters();
                    $('analysis-filters').scrollIntoView({ block: 'start' });
                    $('period-select').focus({ preventScroll: true });
                });
                card.append(button);
                return card;
            }),
        );
        if (!years.length)
            $('year-recaps').append(node('p', 'empty-state', 'No dated plays in this period.'));
    }

    function habit(label, value, detail) {
        const item = node('div', 'habit-item');
        item.append(
            node('span', 'muted', label),
            node('strong', '', value),
            node('small', 'muted', detail),
        );
        return item;
    }

    function renderHabits(stats) {
        const top = [...stats.sortedArtists].sort(
            (a, b) => b.count - a.count || a.name.localeCompare(b.name),
        )[0];
        const loop = stats.mostRepeatedDay;
        const dated = stats.records
            .filter((entry) => entry.timestamp)
            .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
        const first = dated[0];
        const last = dated[dated.length - 1];
        $('listening-habits').replaceChildren(
            habit(
                'Your most played artist',
                top ? top.name : '—',
                top
                    ? `${percent(top.count, stats.totalPlays)} of all plays in this period`
                    : 'No plays in this period',
            ),
            habit(
                'Shuffle mode',
                stats.shuffleKnown ? percent(stats.shuffled, stats.shuffleKnown) : 'Not recorded',
                stats.shuffleKnown
                    ? `Among ${number(stats.shuffleKnown)} plays with shuffle information`
                    : 'Requires extended Spotify metadata',
            ),
            habit(
                'Offline listening',
                stats.offlineKnown ? percent(stats.offline, stats.offlineKnown) : 'Not recorded',
                stats.offlineKnown
                    ? `Among ${number(stats.offlineKnown)} plays with offline information`
                    : 'Requires extended Spotify metadata',
            ),
            habit(
                'Most replayed in one day',
                loop && loop.count > 1 ? loop.track : 'No repeated song in one day',
                loop && loop.count > 1
                    ? `${loop.artist} · ${number(loop.count)} plays on ${dateLabel(loop.date)}`
                    : 'Based on plays with valid dates',
            ),
            habit(
                'First recorded play in this period',
                first ? first.track : 'Date not recorded',
                first ? `${first.artist} · ${dateLabel(first.date)}` : 'Needs valid timestamps',
            ),
            habit(
                'Latest recorded play in this period',
                last ? last.track : 'Date not recorded',
                last ? `${last.artist} · ${dateLabel(last.date)}` : 'Needs valid timestamps',
            ),
        );
        const known = stats.platforms.some(([name]) => name !== 'Not recorded');
        $('platforms-list').replaceChildren();
        if (!known) {
            $('platforms-list').append(
                node(
                    'li',
                    'empty-state',
                    'Device and platform labels are not recorded in these files.',
                ),
            );
            return;
        }
        for (const [name, count] of stats.platforms) {
            const item = node('li', 'platform-item');
            const line = node('div', 'platform-label');
            line.append(
                node('span', '', name),
                node(
                    'span',
                    'muted',
                    `${number(count)} plays · ${percent(count, stats.totalPlays)}`,
                ),
            );
            const bar = node('div', 'platform-bar');
            const fill = node('span');
            fill.style.width = `${(count / stats.totalPlays) * 100}%`;
            bar.append(fill);
            item.append(line, bar);
            $('platforms-list').append(item);
        }
    }

    function render(stats, filters) {
        currentStats = stats;
        currentFilters = filters;
        $('filtered-empty').classList.toggle('hidden', stats.totalPlays !== 0);
        $('custom-dates').classList.toggle('hidden', $('period-select').value !== 'custom');
        $('filter-message').classList.remove('filter-error');
        $('filter-message').textContent =
            `Showing ${number(stats.totalPlays)} plays · ${filters.metric === 'ms' ? 'Ranked by listening time' : 'Ranked by plays'} · Dates and hours use UTC.${stats.undatedPlays ? ` ${number(stats.undatedPlays)} plays without valid timestamps ${filters.startDate ? 'excluded from this date filter' : 'included in totals, excluded from time-based views'}.` : ''}${stats.estimatedPlays ? ' Time-based statistics include estimated durations.' : ''}`;
        renderFacts(stats);
        renderRhythm(stats);
        const selectedYear = $('calendar-year').value;
        const years = stats.availableYears;
        $('calendar-year').replaceChildren(
            ...years.map((year) => {
                const option = node('option', '', year);
                option.value = year;
                return option;
            }),
        );
        const periodYear = filters.startDate?.slice(0, 4);
        $('calendar-year').value =
            periodYear && periodYear === filters.endDate?.slice(0, 4) && years.includes(periodYear)
                ? periodYear
                : years.includes(selectedYear)
                  ? selectedYear
                  : stats.lastDate?.slice(0, 4) || years[0] || '';
        $('calendar-year').disabled = !years.length;
        renderCalendar();
        renderLibrary(stats);
        renderYears(stats);
        renderHabits(stats);
    }

    function resizeCharts() {
        for (const chart of charts.values()) chart.resize();
    }
    return { initialize, getFilters, updateYears, render, resizeCharts };
})();
