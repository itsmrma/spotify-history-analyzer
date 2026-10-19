---
name: Music History Analyzer
description: A restrained Material Design 3 listening notebook
colors:
    bg: '#141218'
    surface: '#1d1b20'
    surface-raised: '#2b2930'
    line: '#49454f'
    text: '#e6e0e9'
    muted: '#cac4d0'
    primary: '#d0bcff'
    primary-ink: '#381e72'
    primary-container: '#4f378b'
    on-primary-container: '#eaddff'
    mint: '#b4d9c2'
    outline: '#938f99'
    scrobbler: '#ffc28f'
    light-bg: '#fdf7ff'
    light-surface: '#f7f2fa'
    light-surface-raised: '#ece6f0'
    light-line: '#cac4d0'
    light-text: '#1d1b20'
    light-muted: '#49454f'
    light-primary: '#6750a4'
    light-primary-ink: '#ffffff'
    light-primary-container: '#eaddff'
    light-on-primary-container: '#21005d'
    light-mint: '#28634c'
    light-outline: '#79747e'
    light-scrobbler: '#875021'
  divider: 'rgba(167, 171, 192, 0.12)'
  light-divider: 'rgba(73, 69, 79, 0.2)'
  scrim: 'rgba(0, 0, 0, 0.6)'
  hover-shadow: 'rgba(0, 0, 0, 0.2)'
typography:
    display:
        fontFamily: 'Inter, Segoe UI, system-ui, -apple-system, sans-serif'
        fontSize: 'clamp(2rem, 5vw, 3rem)'
        fontWeight: 500
        lineHeight: 1.05
        letterSpacing: '-0.035em'
    headline:
        fontFamily: 'Inter, Segoe UI, system-ui, -apple-system, sans-serif'
        fontSize: 'clamp(1.5rem, 3vw, 2rem)'
        fontWeight: 500
        lineHeight: 1.3
        letterSpacing: '-0.02em'
    title:
        fontFamily: 'Inter, Segoe UI, system-ui, -apple-system, sans-serif'
        fontSize: '1.3rem'
        fontWeight: 500
        lineHeight: 1.4
    body:
        fontFamily: 'Inter, Segoe UI, system-ui, -apple-system, sans-serif'
        fontSize: '1rem'
        lineHeight: 1.6
    label:
        fontFamily: 'Inter, Segoe UI, system-ui, -apple-system, sans-serif'
        fontSize: '0.875rem'
        fontWeight: 600
  brand:
    fontFamily: 'Inter, Segoe UI, system-ui, -apple-system, sans-serif'
    fontSize: '0.95rem'
    fontWeight: 650
  brand-caption:
    fontFamily: 'Inter, Segoe UI, system-ui, -apple-system, sans-serif'
    fontSize: '0.75rem'
  compact-body:
    fontFamily: 'Inter, Segoe UI, system-ui, -apple-system, sans-serif'
    fontSize: '0.9rem'
  drawer-title:
    fontFamily: 'Inter, Segoe UI, system-ui, -apple-system, sans-serif'
    fontSize: '1.125rem'
  compact-metric:
    fontFamily: 'Inter, Segoe UI, system-ui, -apple-system, sans-serif'
    fontSize: '1.15rem'
  year:
    fontFamily: 'Inter, Segoe UI, system-ui, -apple-system, sans-serif'
    fontSize: '1.75rem'
  metric:
    fontFamily: 'Inter, Segoe UI, system-ui, -apple-system, sans-serif'
    fontSize: 'clamp(1.8rem, 3.5vw, 2.5rem)'
  mobile-metric:
    fontFamily: 'Inter, Segoe UI, system-ui, -apple-system, sans-serif'
    fontSize: '1.9rem'
  icon:
    fontFamily: 'Material Icons Outlined'
    fontSize: '24px'
  button-icon:
    fontFamily: 'Material Icons Outlined'
    fontSize: '20px'
  brand-icon:
    fontFamily: 'Material Icons Outlined'
    fontSize: '26px'
  scrobbler-icon:
    fontFamily: 'Material Icons Outlined'
    fontSize: '32px'
  upload-icon:
    fontFamily: 'Material Icons Outlined'
    fontSize: '40px'
rounded:
  calendar: '3px'
    field: '4px'
  platform-bar: '6px'
  file-tag: '7px'
  badge: '8px'
  artist-song: '10px'
  small-panel: '12px'
  year: '14px'
    panel: '16px'
    stat: '18px'
  scrobbler-mark: '20px'
  drawer: '24px'
  upload-mark: '28px'
  jump-link: '30px'
    pill: '100px'
  circle: '50%'
spacing:
    compact: '8px'
    group: '16px'
    section: '24px'
    shell: '32px'
components:
    button-primary:
        backgroundColor: '{colors.primary}'
        textColor: '{colors.primary-ink}'
        rounded: '{rounded.pill}'
        padding: '12px 24px'
    button-secondary:
        backgroundColor: 'transparent'
        textColor: '{colors.primary}'
        rounded: '{rounded.pill}'
        padding: '12px 24px'
    panel:
        backgroundColor: '{colors.surface}'
        textColor: '{colors.text}'
        rounded: '{rounded.panel}'
    field:
        backgroundColor: 'transparent'
        textColor: '{colors.text}'
        rounded: '{rounded.field}'
        padding: '14px 16px'
---

# Design System: Music History Analyzer

## Overview

**Creative North Star: "Taccuino d'ascolto"**

A calm, readable listening notebook. The owner confirmed this description and the
existing Material Design 3 identity. Preserve local Inter, lavender accents, tonal
surfaces and clear controls while helping people understand their own music data.

**Key Characteristics:**

- Quiet tonal depth, clear focus and restrained color.
- Consistent controls for file import, analysis and history search.
- Light and dark variants with the same hierarchy and behavior.

## Colors

Lavender identifies primary actions, mint distinguishes listening information and
warm orange marks scrobbler integration. Neutral surfaces carry the dense data.

### Primary

Lavender (`primary`) carries buttons, selected tabs, keyboard focus and chart lines.
Use the paired ink and container roles for text on colored backgrounds.

### Secondary

Mint (`mint`) identifies listening time, activity and selected data emphasis.
Warm orange (`scrobbler`) scopes the scrobbler form and its controls.

### Neutral

Background, surface and raised surface provide three tonal levels. Text, muted,
outline and line distinguish content, support text, controls and separators.

The frontmatter captures both palettes; `light-*` entries correspond to the same
CSS variable in `:root[data-theme='light']`. Additional status, calendar and chart
roles are defined in `assets/css/style.css`. Consume those variables rather than
introducing literal colors in components or canvas configuration.

**The Paired Ink Rule.** Every colored control uses its corresponding foreground
token. Canvas marks, ticks, grids, fills and tooltips must change with the theme.

## Typography

Use the locally served variable Inter family with system fallbacks. Material Icons
Outlined is the icon system, not a text face. The hierarchy is display, headline,
section title, body and compact secondary text. Use tabular numerals for metrics.

Secondary labels and metadata use at least 0.875rem; the brand caption uses 0.75rem.
Mobile inputs use 1rem to avoid focus zoom on iOS. Headline tracking
stays above -0.04em. Hero prose is limited to 70ch and help copy to 65ch.

## Layout

The standard shell is capped at 1160px with 32px horizontal padding, reduced on
small screens. History search uses 80% of wide desktop viewports. Dashboard groups
use 16px or 24px gaps, with three-column statistics and two-column insight panels.
Breakpoints at 900px and 600px progressively stack content. At 767px navigation
moves into the existing side drawer; the theme toggle stays in the header.

Keep the main overview visible. Put the six secondary personal records in an
expandable group. The annual calendar scrolls inside its own labeled region:
cells are 24px for precise pointers and 44px for coarse pointers. Keyboard arrow
navigation remains available. Long track and artist names wrap within their field.

## Elevation & Depth

Tonal layering supplies most depth. Panels use an outline at rest. Menus and the
navigation drawer use soft offset shadows to indicate temporary elevation.
Hover and pressed states use shared state layers. Focus uses a 2px primary outline
with 4px offset; outlined fields use an inset primary stroke.

Transitions are brief and functional. Reduced motion removes drawer movement,
spinner rotation and chart animation while preserving text status and selected states.

## Shapes

Outlined fields and menus have tight corners. Panels use rounded corners, statistics
retain their existing slightly softer shape and action buttons use pills. Use the
established silhouettes instead of introducing new decorative containers.

## Components

### Buttons

Filled primary actions use lavender and paired ink; secondary actions use an outlined
pill. Main actions have a minimum height of 48px. Disabled controls communicate
unavailability and keep a distinct cursor. The theme button is a native toggle with
a stable accessible name and `aria-pressed` state.

### Inputs and menus

Inputs retain visible labels above the outlined field. Material listboxes support
keyboard selection, typeahead, touch and Escape. Dates use `dd/mm/yyyy`, a calendar
shortcut and explicit UTC labels. Preserve input on failed validation.

### Navigation

Three tabs indicate the selected surface. On mobile the drawer traps focus, makes
the background inert and restores focus on dismissal. The header brand links to
the main landmark without clearing the loaded session.

### History and status

The upload panel presents one primary action, a visible privacy/session explanation
and expandable export instructions. Undo restores the last history change, including
clearing. Success, warning and error states use paired semantic surface/ink roles.
Status remains textual and announced; never rely on color alone.

### Listening visualizations

Chart colors read the active CSS palette and update in place on theme changes.
Keep the existing textual chart equivalents, artist picker and keyboard calendar.
The calendar legend follows the same palette as the cells. Missing dates, metadata
and estimated durations are stated explicitly.

## Do's and Don'ts

### Do:

- Do preserve the Material Design 3 identity and local font/icon delivery.
- Do pair semantic colors with text labels and accessible states.
- Do verify imports, errors, both themes and narrow layouts with real rendered output.
- Do preserve data, filter state and calendar selection when switching theme or tabs.

### Don't:

- Don't persist listening history or API keys with the theme preference.
- Don't reset the session through the brand link or a failed import.
- Don't hardcode canvas colors or use tiny text for essential supporting information.
- Don't infer lifetime behavior from gaps or first appearances in imported files.
