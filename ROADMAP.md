# Roadmap

Ideas and planned work for OpenTaxMap. Not commitments or dates - a backlog.
Contributions welcome; see [CONTRIBUTING.md](CONTRIBUTING.md).

## Data

- [x] **Historical expansion 2016-2026** - per-locality table years extracted
      and published (11 tax years).
- [ ] **2011-2015 (prose years) - committed task** - the older booklets list
      localities as grouped prose with irregular ordering and, in 2014-2015,
      digit corruption on extraction. A best-effort parser exists
      (`scripts/extract_prose.py`) but is not yet reliable enough to publish.
      We will take this on: a careful per-year parse (likely per-year quirks),
      a fix for the bidi digit corruption, and validation against known
      anchors before these years go live. Publishing wrong historical rates is
      not acceptable, so accuracy gates release. See
      [data-sources/README.md](data-sources/README.md).
- [ ] **Year-range slider + animated timeline** - a "play" control sweeping
      2011 -> 2026, watching the map fill and empty as the list changes.
- [ ] **RSS / JSON feed of changes** - subscribable "what changed this tax
      year" (localities added, removed, rate/cap changed).

## Features

- [ ] **"Am I eligible?" wizard** - short guided flow (where you live, since
      when) -> plain-language eligibility answer + which forms (101, 1312א).
- [ ] **Salary calculator inside compare** - same gross salary across 2-3
      localities, ranked by actual saving.
- [ ] **Locality deep-dive** - population trend, distance to border, a
      sparkline of the rate history inside each card.
- [ ] **Export / embed** - download the filtered list as CSV; an `<iframe>`
      embed snippet so news sites can embed the map.
- [ ] **Heatmap / choropleth toggle** - color regions by average benefit or
      number of eligible localities.
- [ ] **Per-locality share card** - dynamically generated OpenGraph image per
      `/yishuv/<slug>` (today there is one static `og.png`).

## Platform

- [ ] **v0.3.0 - self-hosted vector basemap (Protomaps + MapLibre)** - replace
      the Leaflet + Israel Hiking Map basemap (cluttered, shows the green line)
      with a self-hosted Protomaps PMTiles basemap rendered by MapLibre GL. The
      style is authored in-house: a clean map (places, roads, water), **no
      boundaries layer**, labels that follow the UI language (Hebrew `name:he`
      in the Hebrew site, English `name:en` in the English site, RTL text
      plugin for correct Hebrew shaping). Includes an **Area A/B/C overlay**
      layer. The tile file is served first-party from Cloudflare R2 (no 25 MiB
      Workers-asset cap; range requests supported). Feasibility proven with a
      working prototype. This supersedes the GovMap and keyed-basemap items
      below, which are no longer needed (GovMap access was not granted after a
      week). Remaining work: MapLibre migration (markers, popups, locate,
      language switch), self-host glyphs, source the Area A/B/C GeoJSON, build
      and upload the Israel PMTiles to R2, `worker-src blob:` CSP addition.
- [ ] **PWA / offline** - installable, works offline (the dataset is tiny),
      app icon on mobile.
- [ ] **Full accessibility + performance audit** - complete the automated
      a11y/perf/SEO sweep before a public launch.

## Infrastructure

- [x] **Deploy via Cloudflare Workers Builds** - the site deploys straight from
      the repo on push to `main`, with no deploy credentials stored in GitHub.
- [ ] Consider a visual-regression check (Playwright screenshots) in CI.
- [ ] Per-locality dynamic OpenGraph image at build time (see "Per-locality
      share card" above).
