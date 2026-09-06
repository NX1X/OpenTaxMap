# GovMap API reference

Notes compiled from [api.govmap.gov.il/docs/intro](https://api.govmap.gov.il/docs/intro)
(Israel's government mapping portal, "פורטל המפות הממשלתי") for the planned
basemap migration - see the "GovMap basemap (migration)" item in
[ROADMAP.md](../ROADMAP.md). Not exhaustive: the JS API alone exposes 60+
functions; this covers what's needed to evaluate and start the integration,
with links back to the official docs for anything not reproduced here.

**Status**: NX1X has an approved, domain-bound API token from GovMap, scoped
to `taxmap.nx1xlab.dev`. The token has not been requested or entered anywhere
in this session - it will be added directly to the Vercel project's
environment variables when the integration is actually wired up. See
"Secret handling" at the bottom of this document.

## What it is

Three integration methods, increasing in complexity:

1. **URL parameters** - share a pre-configured map view via a query string,
   no development needed.
2. **HTML embedding** - an `<iframe>` pointed at a configured GovMap URL.
3. **JavaScript API** - full programmatic control (`govmap.createMap()` and
   60+ functions), including search/geocoding without displaying a map at
   all. This is the one relevant to replacing the current Leaflet basemap.

**Language/encoding constraint**: the system's text and numeric fields are
English-only; Hebrew and spaces in query strings must be URL-encoded.

## Authentication

The JS API requires a **token**, obtained from GovMap and **bound to a
specific domain** - it will not work from any other origin. Every
`govmap.createMap()` call and every standalone function call must include a
valid token from the authorized domain.

```html
<script src="https://www.govmap.gov.il/govmap/api/govmap.api.js" defer onload="initGovMap()"></script>
<script>
function initGovMap() {
  govmap.createMap('map', {
    token: 'YOUR_API_TOKEN',
    layers: ["GASSTATIONS", "PARCEL_HOKS", "KSHTANN_ASSETS", "bus_stops", "PARCEL_ALL"],
    showXY: true,
    identifyOnClick: true,
    isEmbeddedToggle: false,
    background: "1",
    layersMode: 1,
    zoomButtons: false
  });
}
</script>
```

There is no documented rate limit, pricing, or licensing text on the pages
fetched - only the domain-binding and English-only-field constraints above.

## URL functions

Base pattern: `https://www.govmap.gov.il/?<params>`

| Param | Meaning | Values |
|---|---|---|
| `c` | Center coordinates | ITM: X 100000-300000, Y 370000-810000. WGS84: X 4-36 (some pages say 34-36), Y 29.4-33.4. Comma-separated `X,Y` |
| `z` | Zoom level | 0 (low detail) - 10 (high detail) |
| `mk` | Show a marker at center | 0 hidden (default), 1 visible |
| `b` | Background type | 0/3 = streets, 1 = aerial, 2 = hybrid, 3 = CIR aerial, 4-6 = historical maps, 7/11 = no map, 15/17 = English |
| `lay` | Extra server layers | comma or pipe-separated layer names/IDs, see Appendix A below |
| `q` | Search text, executed and zoomed to top result on load | any text, `encodeURIComponent` recommended |
| `bs` | Info bubble on load | by location: `LAYER\|X,Y`; by field: `LAYER\|FIELD~VALUE` |

Examples:
```
https://www.govmap.gov.il/?c=179449,663927&z=8&b=0
https://www.govmap.gov.il/?q=%D7%A6%D7%A4%D7%AA
https://www.govmap.gov.il/?c=179500,663900&z=6&b=1&lay=CELL_ACTIVE
https://www.govmap.gov.il/?c=178931.14,664738.15&z=10&b=1&lay=CELL_ACTIVE,PARCEL_ALL&bs=CELL_ACTIVE,PARCEL_ALL|178903,664738
https://www.govmap.gov.il/?c=181768.3,656616.31&z=7&lay=GASSTATIONS&bs=GASSTATIONS|NAME~הסיירים
```

Full pages: [zoom-by-coordinates](https://api.govmap.gov.il/docs/url-functions/zoom-by-coordinates) ·
[search-query](https://api.govmap.gov.il/docs/url-functions/search-query) ·
[add-layers](https://api.govmap.gov.il/docs/url-functions/add-layers) ·
[add-bubble-on-map](https://api.govmap.gov.il/docs/url-functions/add-bubble-on-map)

## HTML embedding

An `<iframe>` whose `src` is a configured GovMap URL (same parameters as
above). GovMap's own site has a "share -> HTML code" button that generates
this for you. See [docs/intro/html](https://api.govmap.gov.il/docs/intro/html).

## JavaScript API: `govmap.createMap(mapDivId, MapSetting)`

| Option | Type | Default | Notes |
|---|---|---|---|
| `token` | string | required | domain-bound |
| `onClick` / `onError` / `onPan` / `onLoad` | function | - | event callbacks |
| `background` | string | - | background layer id |
| `center` | `{x, y}` | - | |
| `level` | number | - | initial zoom |
| `setMapMarker` | boolean | - | marker at center on load |
| `showXY` | boolean | - | show cursor coordinates |
| `identifyOnClick` | boolean | `true` | query layers on click |
| `identifyOnlyBubble` | boolean | `false` | bubble without marker |
| `identifyOnlySelect` | boolean | `false` | bubble without marker (select variant) |
| `layers` | string[] | - | layers available in the layer list |
| `visibleLayers` | string[] | - | layers on by default |
| `bgButton` | boolean | `true` | show background switcher |
| `zoomButtons` | boolean | `true` | show zoom controls |
| `isEmbeddedToggle` | boolean | - | `true` = simplified UI, `false` = full |
| `layersMode` | number | - | 1 toggle only, 2 toggle+legend, 3 legend only, 4 hidden |
| `extent` | `{xmin, ymin, xmax, ymax}` | `null` | locks pan/zoom bounds |

Multiple independent map instances are supported (different `mapDivId`
values). Full page: [javascript-functions/create-map](https://api.govmap.gov.il/docs/javascript-functions/create-map).

Function categories beyond `createMap` (60+ total, see the docs site for
each): map control, event handling, identify/click queries, visualization
(background, layer opacity, cursor), GPS, drawing, markers, data retrieval
(`get-layer-data`, `get-layer-entities`, `get-xy`, ...), geocoding, layer
filtering, heat layers, search-in-layer, print/export/measure tools, and
entity save/edit.

## Standalone functions (no map required)

Still require the token, from the authorized domain, on every call.

- `get-layer-features-by-location` - spatial query by coordinate
- `get-layer-filter-fields` - available filter fields for a layer
- `search` - text search returning a result list (built for autocomplete)
- `getSearchResultData` - full detail for one search result

Docs wrap these in try/catch since errors print to console rather than
throwing. See [docs/intro/standalone](https://api.govmap.gov.il/docs/intro/standalone)
and [docs/intro/search-functions](https://api.govmap.gov.il/docs/intro/search-functions).

## Appendix A: layer IDs (partial, per GovMap's own docs)

| Layer ID | Meaning |
|---|---|
| `SUB_GUSH_ALL` | Parcels/blocks (גושים) |
| `PARCEL_ALL` | Plots (חלקות) |
| `add_control_points` | Control points |
| `retzefMigrashim` | Planning sites (רמ"י) |
| `migrashim_msbs` | Sites - Ministry of Construction & Housing |
| `local_committees` | Local committees |
| `neighborhoods_area` | Neighborhoods (area) |
| `Neighborhood` | Neighborhoods (point) |
| `kids_g` | Kindergartens |
| `school` | Schools |
| `bus_stops` | Bus stops |
| `GASSTATIONS` | Gas stations |

Layers can also be referenced by numeric ID (`lay=234077`) or a prefixed
alias (`lay=layer_234077`). Full list: [docs/intro/attache-a](https://api.govmap.gov.il/docs/intro/attache-a).

## Appendix B: enum variables (properties of the global `govmap` object)

- `govmap.events`: PAN 0, EXTENT_CHANGE 1, CLICK 3, DOUBLE_CLICK 4, MOUSE_MOVE 5, MOUSE_OVER 8
- `govmap.internalClickEvents`: GET_XY_CLICK 10
- `govmap.locateType`: lotParcelToAddress 0, addressToLotParcel 1
- `govmap.cursorType`: DEFAULT 0, TARGET 1, POLYGON 3, CIRCLE 4, RECTANGLE 5, SELECT_FEATURES 6
- `govmap.geometryType`: POINT 0, POLYLINE 1, POLYGON 2, LINE 3, CIRCLE 4
- `govmap.drawType`: Point 0, Polyline 1, Polygon 2, Circle 3, Rectangle 4, FreehandPolygon 6
- `govmap.rendererType`: Simple 0, SimplePicture 1, JenksNaturalBreaks 2, EqualInterval 3, Quantile 4, ClassBreaks 5
- `govmap.geocodeType`: FullResult 0, AccuracyOnly 1
- `govmap.saveActions`: Delete 1, Update 2, New 3
- `govmap.saveActionStatus`: Failed 0, Deleted 1, Updated 2, Inserted 3
- `govmap.layerFilterFields`: 1 text, 2 number, 3 check, 4 multiChoice, 7 hoursTime, 8 date

Full list: [docs/intro/attache-b](https://api.govmap.gov.il/docs/intro/attache-b).
Live examples: [govmap.gov.il/sites/api/index.html](https://www.govmap.gov.il/sites/api/index.html).

## Secret handling for the actual integration

Do this when the integration is actually wired up, not before:

1. Add the token as a Vercel project environment variable, name
   `GOVMAP_API_TOKEN` (matches the naming convention already used for
   `CF_ANALYTICS_TOKEN` in this repo's history - build-time public value,
   not a server secret, since the token is domain-bound rather than
   account-bound and is visible in any page that embeds the map).
2. Reference it in the client bundle the same way `__APP_VERSION__` is
   injected today (`vite.config.js`'s `define`), or read it at prerender
   time the way `scripts/prerender.mjs` used to read `CF_ANALYTICS_TOKEN`.
3. The token only works from `taxmap.nx1xlab.dev` - a Vercel preview
   deployment (a different subdomain) will not be able to use it. Test the
   map integration against production, or ask GovMap to also authorize the
   preview domain pattern if that's supported.
4. Never commit the token value itself to the repository, only the env var
   name and the wiring code that reads it.
