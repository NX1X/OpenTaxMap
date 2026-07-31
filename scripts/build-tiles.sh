#!/usr/bin/env bash
# Build the self-hosted Israel basemap tiles for the v0.3.0 MapLibre map.
#
# Extracts an Israel + West Bank bounding box from the Protomaps global daily
# build (over HTTP range requests, so it does not download the planet) into a
# single .pmtiles archive. That file is then uploaded to Cloudflare R2 and
# served first-party by the Worker (see wrangler.jsonc R2 binding).
#
# Requirements: the `pmtiles` CLI (https://github.com/protomaps/go-pmtiles).
# Network access to demo-bucket.protomaps.com.
#
# Usage:  scripts/build-tiles.sh [maxzoom]      (default maxzoom 14)
set -euo pipefail

MAXZOOM="${1:-14}"
# Israel + West Bank + a margin (matches DATA_BOUNDS in the app).
BBOX="34.2,29.4,35.95,33.45"
SRC="https://demo-bucket.protomaps.com/v4.pmtiles"
OUT="tiles/israel.pmtiles"

mkdir -p tiles
echo "Extracting bbox $BBOX at maxzoom $MAXZOOM from $SRC ..."
pmtiles extract "$SRC" "$OUT" --bbox="$BBOX" --maxzoom="$MAXZOOM"

echo
echo "Built $OUT ($(du -h "$OUT" | cut -f1))."
echo "Layers: $(pmtiles show --metadata "$OUT" | python3 -c 'import sys,json;print(",".join(l["id"] for l in json.load(sys.stdin)["vector_layers"]))')"
echo
echo "Next: upload to R2, e.g."
echo "  npx wrangler r2 object put opentaxmap-tiles/israel.pmtiles --file=$OUT --remote"
echo
echo "The Protomaps basemap is derived from OpenStreetMap and Natural Earth."
echo "Attribution '(c) OpenStreetMap contributors' is required in the map UI."
