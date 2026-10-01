# Music History Analyzer

A private, browser-based tool for exploring your Spotify listening history and filling recent gaps with ListenBrainz.

**[Open the web app](https://itsmrma.github.io/spotify-history-analyzer/)**

## Using the app

1. Request your Spotify Extended Streaming History, then upload the ZIP archive or individual JSON files. Basic Spotify history JSON is also supported.
2. Explore your top artists, top songs, listening time and longest consecutive-day artist streaks. Search for an artist to see their top ten songs and personal record.
3. Use **Add files** to combine additional exports. Exact duplicates with the same timestamp, artist and track are ignored. Records without valid timestamps remain countable but cannot be reliably deduplicated or used for streaks.
4. Open **ListenBrainz**, enter your public username and the first missing day, then add recent listens to the dashboard or download a Spotify-compatible JSON file.

Only music plays lasting at least 30 seconds count. Podcasts, short plays and malformed records are ignored. Dates and streaks use UTC. Known ListenBrainz durations are used when available; missing durations are estimated at three minutes and marked `duration_estimated` in downloaded files. Choose a start date after your Spotify export to avoid overlapping history: Spotify and ListenBrainz may timestamp the same listen differently, so overlapping plays with different timestamps are not automatically matched.

Your history and search results stay available when switching tabs. Invalid files and failed or cancelled downloads preserve the existing dashboard. Your data is held in memory for the current page session; refreshing clears it.

## Privacy and dependencies

Uploaded files are processed locally and are never sent to a server. Fonts and icons are local, and the app makes no third-party requests until you explicitly download ListenBrainz history. That action sends your username and requested timestamps to the public ListenBrainz API.

The app is a static site with no build step. JSZip 3.10.1 and Chart.js 4.5.1 are checked into `vendor/` with their licenses, so the site does not rely on a runtime CDN. To refresh these assets after changing the locked dependencies, run `npm run vendor` and commit the updated files.

ListenBrainz pagination follows the [official API documentation](https://listenbrainz.readthedocs.io/en/latest/users/api/core.html): `max_ts` is exclusive and timestamps are UTC. Requests have a timeout, bounded retries for rate limits and a cancel control. Failed downloads do not integrate partial history.

## Development and checks

Install Node.js 22 or newer and Python 3.10 or newer, then run:

```sh
npm ci
npm start
```

Open `http://127.0.0.1:4173`. The static files can also be hosted directly on GitHub Pages.

```sh
npm test
python -m unittest discover -s tests -p test_legacy.py -v
npx playwright install chromium
npm run test:e2e
npm run format:check
```

Regression tests cover validation, duplicate handling, large histories, streaks, safe text rendering, ZIP imports, search, tab switching and ListenBrainz integration, downloads and error recovery. Browser checks cover desktop and mobile layouts, widths from 320 to 1440 pixels, keyboard navigation and automated accessibility checks. ListenBrainz browser tests use mocked API responses so they are deterministic and do not download anyone's personal history. GitHub Actions runs the checks on pushes and pull requests.

## Legacy Python scripts

The web app replaces the original CLI tools, which remain available for terminal use. They use only the Python standard library.

- `listenbrainz.py`: downloads public history from a chosen UTC start date into Spotify-compatible JSON.
- `spotify_anal.py`: shows artist rankings, consecutive-day streaks and songs for a selected artist.
- `spot_top100.py`: lists the hundred most played songs from a folder of history JSON files.
- `history_utils.py`: shared validation and file loading for the analyzers.

This is an independent personal project and is not affiliated with Spotify or MetaBrainz/ListenBrainz.
