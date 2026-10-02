# Music History Analyzer

A personal project for viewing Spotify listening stats and adding listens from ListenBrainz, Last.fm and Maloja.

**[Open the web app](https://itsmrma.github.io/spotify-history-analyzer/)**

## Using the app

1. Request your Spotify Extended Streaming History, then upload the ZIP archive or individual JSON files. Basic Spotify history JSON is also supported.
2. Explore your top artists, songs and albums, monthly listening timeline, daily activity calendar, favourite weekdays and listening hours. Choose a year or custom inclusive date range, and rank by plays or listening time.
3. Use **Add files** to combine additional exports. Exact duplicates with the same timestamp, artist and track are ignored. Records without valid timestamps remain countable but cannot be reliably deduplicated or used for streaks.
4. Open **Scrobblers**, choose ListenBrainz, Last.fm or Maloja and the first missing day, then add listens to the dashboard or download a Spotify-compatible JSON file. ListenBrainz uses your public username; Last.fm also needs [your API key](https://www.last.fm/api/account/create); Maloja uses your server base URL and requires browser access (CORS). Use an HTTPS Maloja server when the app is hosted over HTTPS. You can also upload native JSON exports (ListenBrainz listens, Last.fm recent tracks or Maloja scrobbles) from **Your history**. These services can only fill dates they already recorded.

Only music plays lasting at least 30 seconds count. Podcasts, short plays and malformed records are ignored. Dates and streaks use UTC. Known ListenBrainz and Maloja durations are used when available; missing durations are estimated at three minutes and marked `duration_estimated` in downloaded files. Choose a start date after your Spotify export to avoid overlapping history: Spotify and scrobblers may timestamp the same listen differently, so overlapping plays with different timestamps are not automatically matched.

Your history, filters and search results stay available when switching tabs. Invalid files and failed or cancelled downloads preserve the existing dashboard. Your data is held in memory for the current page session; refreshing clears it.

## Analysis features

- **Personal records:** unique songs, active days, average time per active day, busiest day, longest consecutive-day listening streak across any artist and repeat-play share.
- **Listening rhythm:** monthly trends with empty months included, busiest month, favourite weekday and peak hour, using UTC timestamps.
- **Interactive calendar:** year selector, daily intensity, per-day song details, leap-year support and arrow-key navigation. Empty cells describe the imported files; they do not prove that you did not listen on that date.
- **Library insights:** top albums with metadata coverage, artist discoveries based on the first dated appearance in the complete imported history, yearly recaps and an artist explorer with first/last dates and share of plays.
- **Listening habits:** shuffle and offline percentages among records with those fields, most repeated song in a day, first/latest recorded plays and device/platform breakdown. Missing fields are reported explicitly. Devices and platforms initially show the top five labels; use the button to expand or collapse the full list. The habits card keeps its natural height.
- **CSV export:** downloads the complete song ranking for the selected period and metric, regardless of the number of visible table rows. Formula-like names are escaped for spreadsheet safety.

Date filters exclude records without valid timestamps. Without a date filter, those records remain in total counts and rankings but cannot contribute to date-based views. Album, device, shuffle and offline insights depend on optional export metadata. Artist discoveries mean first seen in these files, not necessarily your first lifetime listen. All time-based statistics can include marked estimates from scrobblers.

## Privacy and dependencies

Uploaded files are processed locally and are never sent to a server. The interface follows Material Design 3 with locally served Inter and Google Material Icons Outlined (licenses in `assets/fonts/`). Fonts and icons are local, and the app makes no third-party requests until you explicitly fetch scrobbler history. That action sends your username and requested range to ListenBrainz or Last.fm, or the requested range to your Maloja server. Last.fm requests include the API key you entered; it is kept only in the page session and is never stored by the app.

The app is a static site with no build step. JSZip 3.10.1 and Chart.js 4.5.1 are checked into `assets/vendor/` with their licenses, so the site does not rely on a runtime CDN. To refresh these assets after changing the locked dependencies, run `npm run vendor` and commit the updated files.

ListenBrainz pagination follows the [official API documentation](https://listenbrainz.readthedocs.io/en/latest/users/api/core.html): `max_ts` is exclusive and timestamps are UTC. Requests have a timeout, bounded retries for rate limits and a cancel control. Failed downloads do not integrate partial history. Last.fm follows [user.getRecentTracks](https://www.last.fm/api/show/user.getRecentTracks), using pages of 200 and a fixed end timestamp, ignoring currently playing tracks. Last.fm durations are estimated. Maloja follows its [native scrobbles API](https://github.com/krateng/maloja/blob/master/maloja/apis/native_v1.py) and [entity format](https://github.com/krateng/maloja/blob/master/API.md), using pages of 1,000 and filtering returned timestamps to UTC. All services support cancellation and timeout/rate-limit handling.

## Development and checks

Install Node.js 22 or newer, then run:

```sh
npm ci
npm start
```

Open `http://127.0.0.1:4173`. The static files can also be hosted directly on GitHub Pages.

```sh
npm test
npx playwright install chromium webkit
npm run test:e2e
npm run format:check
```

Regression tests cover validation, duplicate handling, large histories, streaks, date filters, timeline gaps, metadata coverage, ranking metrics and CSV safety. Browser tests exercise imports, search, calendar interaction, exports, filters, empty states and scrobbler integration, downloads and error recovery. Checks cover desktop and mobile layouts in Chromium and mobile WebKit, widths from 320 to 1440 pixels, containment of empty and filled inputs in their fields, keyboard navigation and automated accessibility audits. Scrobbler tests use mocked API responses so they are deterministic and do not download anyone's personal history. GitHub Actions runs the checks on pushes and pull requests.

## Project structure

```text
index.html                  Static entry point for GitHub Pages
assets/
  css/style.css             Shared visual style and responsive layouts
  icons/favicon.svg         Local app icon
  fonts/                    Inter, Material Icons and their licenses
  js/analytics.js           DOM-free validation and analysis
  js/insights.js            Filters, charts, calendar and CSV export
  js/app.js                 Imports, navigation, rankings and scrobblers
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

This is an independent personal project and is not affiliated with Spotify, Last.fm, MetaBrainz/ListenBrainz or Maloja.
