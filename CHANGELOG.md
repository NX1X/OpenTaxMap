# Changelog

All notable changes to OpenTaxMap. The format is based on
[Keep a Changelog](https://keepachangelog.com/); this project uses
[Semantic Versioning](https://semver.org/).

Hebrew version: [CHANGELOG.he.md](CHANGELOG.he.md).

## [Unreleased]

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

[Unreleased]: https://github.com/NX1X/OpenTaxMap/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/NX1X/OpenTaxMap/releases/tag/v0.1.0
