# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

A personal tool for people exploring their own music listening history, on desktop or mobile.
The owner confirmed this context during the Impeccable review on 2026-10-19.

## Product Purpose

Music History Analyzer turns Spotify and scrobbler exports into searchable listening
statistics, rankings, calendars and insights. Success means understanding the imported
history while retaining control of the source data.

## Positioning

History files are processed locally in the browser. Spotify exports can be combined
with recorded listens from ListenBrainz, Last.fm and Maloja without an application account.

## Operating Context

Import ZIP or JSON files, inspect statistics, filter an inclusive UTC date range,
search the complete history, optionally fetch missing scrobbler listens, and export rankings.
The static application runs with `npm start` at http://127.0.0.1:4173 and has no build step.

## Capabilities and Constraints

- Count music plays lasting at least 30 seconds; ignore podcasts and invalid records.
- Deduplicate matching timestamp, artist and track. Different source timestamps may overlap.
- A scrobbl.rs connection replaces the in-memory history with canonical server listens after confirmation. Preserve stable IDs, ordered credits, sources and server countability; never reconcile these listens again in the client.
- Mark estimated durations. Optional metadata and missing dates must remain explicit.
- For scrobbl.rs, keep actual, estimated and unknown listening time distinct. Count eligible unknown-duration listens without inventing time; retain uncounted short listens in history search.
- Keep listening data in memory for the page session; reloading clears it.
- Serve fonts, icons and libraries locally. External requests occur only for requested scrobbler downloads or an explicitly enabled private scrobbl.rs connection.
- Never persist listening history or API keys. Saving the display theme is permitted.
- The private scrobbl.rs v1 connection uses HTTPS over LAN/VPN, read keys without owner cookies, optional inclusive UTC selection, atomic copies and revision-based updates. Automatic refresh starts off (120 seconds by default, minimum 30), attempts background updates where permitted, and catches up on return. Disconnect cancels requests and clears connection secrets while keeping downloaded history available.
- Support light and dark themes, requested by the owner during this review.

## Brand Commitments

Preserve the existing Material Design 3 identity, English interface, local Inter font
and Material Icons. The owner confirmed a restrained, readable listening notebook,
with lavender accents, tonal surfaces and clear controls.

## Evidence on Hand

`README.md`, `index.html`, `assets/`, unit tests and Playwright fixtures describe the
implemented product. Browser screenshots use synthetic history, not personal listening data.

## Product Principles

- Keep personal history local and make data handling understandable.
- Distinguish facts recorded in the files from missing metadata and estimates.
- Preserve imported history when a request or import fails.
- Keep analysis usable with touch, keyboard and assistive technology.
