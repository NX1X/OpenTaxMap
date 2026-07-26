# Changelog

All notable changes to OpenTaxMap. The format is based on
[Keep a Changelog](https://keepachangelog.com/); this project uses
[Semantic Versioning](https://semver.org/).

Hebrew version: [CHANGELOG.he.md](CHANGELOG.he.md).

## [Unreleased]

## [0.2.0] - 2026-07-26

### Added

- Sharing. On mobile this opens the phone's own share sheet; elsewhere it opens
  a dialog with WhatsApp, Telegram, X, and a copy-link button. The header button
  shares the site and keeps your current language; each locality card also has
  its own share button that shares that locality's permalink.
- A clearer "you are here" marker: the location dot is now red so it stands out
  from the blue locality markers.
- A dismissible note on small screens suggesting a desktop or a landscape tablet
  for the full set of filters.

### Changed

- Rewrote the share message so it encourages passing the map on, helping more
  periphery residents discover a credit many do not know they are owed.
- Single logo mark across the project, and a refreshed social preview image.
- Social link previews attribute to the @NX1XLAB account.

### Fixed

- On phones the filters and the locality list were pushed off-screen behind the
  map, so only the map was visible; the page now scrolls and every option is
  reachable.

## [0.1.1] - 2026-07-26

### Fixed

- Per-locality pages are served directly at `/yishuv/<slug>` instead of
  redirecting to a trailing-slash URL, matching the canonical tags and every
  sitemap entry.
- Removed a leftover redirect rule that prevented the site from deploying.

### Changed

- The site is deployed by Cloudflare Workers Builds directly from this
  repository, so no deploy credentials are stored in GitHub at all.
- Node 22 is now required (see `.nvmrc`).
- The Python data-pipeline requirements moved to `scripts/requirements.txt`.

## [0.1.0] - 2026-07-25

First public version.

### Added
- Interactive map of every Israeli locality eligible for the periphery
  income-tax credit, tax years 2016-2026, color-coded by credit rate.
- Per-locality benefit history (rate and annual income cap) across all years.
- Search in Hebrew and English, with filters by tax year, sector
  (Jewish / Arab / Druze / mixed), region, sub-region (Upper & Lower Galilee,
  Western Galilee, Golan, Gaza Envelope, Western & Eastern Negev, Eilat &
  Arava, Jordan Valley and more), local authority, and credit rate.
- Benefit calculator: estimate the actual saving from a gross monthly salary
  using the real tax brackets per year.
- Locality comparison (up to three side by side) with CSV / JSON export.
- "Changes vs last year" map mode (added / removed / rate changed).
- "Nearest eligible locality" using your location, with a location marker.
- Share button with a call to action, and a clear "locality not in the list"
  help message with a one-click filter reset.
- Version indicator that checks GitHub for a newer release.
- Data and trends view (totals, distribution by rate / sector / sub-region,
  year-over-year trend).
- Per-locality permalinks (`/yishuv/<slug>`) with prerendered pages for search
  engines and AI crawlers.
- Hebrew (RTL) and English (LTR) interface, light and dark themes, and an
  accessibility menu (text size, high contrast, reduced motion, underlined
  links). WCAG 2.1 AA-oriented.
- Hebrew basemap via Israel Hiking Map; English basemap via CARTO.
- Privacy-friendly, first-party Cloudflare Web Analytics (optional).

### Security

- Strict Content-Security-Policy, HSTS, and a hardened set of response headers.
- Supply chain locked down: pinned dependencies with verified hashes, pinned CI
  actions, and automated dependency, secret, and code scanning.

[Unreleased]: https://github.com/NX1X/OpenTaxMap/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/NX1X/OpenTaxMap/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/NX1X/OpenTaxMap/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/NX1X/OpenTaxMap/releases/tag/v0.1.0
