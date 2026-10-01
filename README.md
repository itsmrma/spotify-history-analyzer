# Music History Analyzer

A private, browser-based tool for exploring your Spotify listening history and filling recent gaps with ListenBrainz.

**[Open the web app](https://itsmrma.github.io/spotify-history-analyzer/)**

## Using the app

1. Request your Spotify Extended Streaming History, then upload the ZIP archive or individual JSON files. Basic Spotify history JSON is also supported.
2. Explore your top artists, songs and albums, monthly listening timeline, daily activity calendar, favourite weekdays and listening hours. Choose a year or custom inclusive date range, and rank by plays or listening time.
3. Use **Add files** to combine additional exports. Exact duplicates with the same timestamp, artist and track are ignored. Records without valid timestamps remain countable but cannot be reliably deduplicated or used for streaks.
4. Open **ListenBrainz**, enter your public username and the first missing day, then add recent listens to the dashboard or download a Spotify-compatible JSON file.

Only music plays lasting at least 30 seconds count. Podcasts, short plays and malformed records are ignored. Dates and streaks use UTC. Known ListenBrainz durations are used when available; missing durations are estimated at three minutes and marked `duration_estimated` in downloaded files. Choose a start date after your Spotify export to avoid overlapping history: Spotify and ListenBrainz may timestamp the same listen differently, so overlapping plays with different timestamps are not automatically matched.

Your history, filters and search results stay available when switching tabs. Invalid files and failed or cancelled downloads preserve the existing dashboard. Your data is held in memory for the current page session; refreshing clears it.

## Analysis features

- **Personal records:** unique songs, active days, average time per active day, busiest day, longest consecutive-day listening streak across any artist and repeat-play share.
- **Listening rhythm:** monthly trends with empty months included, busiest month, favourite weekday and peak hour, using UTC timestamps.
- **Interactive calendar:** year selector, daily intensity, per-day song details, leap-year support and arrow-key navigation. Empty cells describe the imported files; they do not prove that you did not listen on that date.
- **Library insights:** top albums with metadata coverage, artist discoveries based on the first dated appearance in the complete imported history, yearly recaps and an artist explorer with first/last dates and share of plays.
- **Listening habits:** shuffle and offline percentages among records with those fields, most repeated song in a day, first/latest recorded plays and device/platform breakdown. Missing fields are reported explicitly.
- **CSV export:** downloads the complete song ranking for the selected period and metric, regardless of the number of visible table rows. Formula-like names are escaped for spreadsheet safety.

Date filters exclude records without valid timestamps. Without a date filter, those records remain in total counts and rankings but cannot contribute to date-based views. Album, device, shuffle and offline insights depend on optional export metadata. Artist discoveries mean first seen in these files, not necessarily your first lifetime listen. All time-based statistics can include marked estimates from ListenBrainz.

## Privacy and dependencies

Uploaded files are processed locally and are never sent to a server. Fonts and icons are local, and the app makes no third-party requests until you explicitly download ListenBrainz history. That action sends your username and requested timestamps to the public ListenBrainz API.

The app is a static site with no build step. JSZip 3.10.1 and Chart.js 4.5.1 are checked into `assets/vendor/` with their licenses, so the site does not rely on a runtime CDN. To refresh these assets after changing the locked dependencies, run `npm run vendor` and commit the updated files.

ListenBrainz pagination follows the [official API documentation](https://listenbrainz.readthedocs.io/en/latest/users/api/core.html): `max_ts` is exclusive and timestamps are UTC. Requests have a timeout, bounded retries for rate limits and a cancel control. Failed downloads do not integrate partial history.

## Development and checks

Install Node.js 22 or newer, then run:

```sh
npm ci
npm start
```

Open `http://127.0.0.1:4173`. The static files can also be hosted directly on GitHub Pages.

```sh
npm test
npx playwright install chromium
npm run test:e2e
npm run format:check
```

Regression tests cover validation, duplicate handling, large histories, streaks, date filters, timeline gaps, metadata coverage, ranking metrics and CSV safety. Browser tests exercise imports, search, calendar interaction, exports, filters, empty states and ListenBrainz integration, downloads and error recovery. Checks cover desktop and mobile layouts, widths from 320 to 1440 pixels, keyboard navigation and automated accessibility audits. ListenBrainz tests use mocked API responses so they are deterministic and do not download anyone's personal history. GitHub Actions runs the checks on pushes and pull requests.

## Project structure

```text
index.html                  Static entry point for GitHub Pages
assets/
  css/style.css             Shared visual style and responsive layouts
  icons/favicon.svg         Local app icon
  js/analytics.js           DOM-free validation and analysis
  js/insights.js            Filters, charts, calendar and CSV export
  js/app.js                 Imports, navigation, rankings and ListenBrainz
  vendor/                   Pinned libraries and their licenses
scripts/
  serve.cjs                 Local development/test server
  vendor.cjs                Refresh the checked-in third-party assets
tests/
  unit/                     Analysis regression tests
  e2e/                      Playwright browser and accessibility tests
.github/workflows/tests.yml Continuous integration
```

The deprecated Python CLI scripts were removed: their features are covered by the web app. `.gitignore` excludes dependencies, generated reports, caches, logs, local configuration/secrets and personal listening archives or exported rankings. Store arbitrary personal JSON exports in `data/` or `exports/`, which are ignored; standard Spotify history filenames are also ignored. Code, tests, the package lockfile and runtime vendor assets remain versioned. The local server serves only the entry page and public assets.

This is an independent personal project and is not affiliated with Spotify or MetaBrainz/ListenBrainz.
