#!/usr/bin/env python3
"""Join the per-year benefit tables (data/raw/<year>.json) with the CBS
locality registry (data/cbs/bycode2023.xlsx) into one dataset for the site.

Output: public/data/localities.json
  {
    "years": [2022, ..., 2026],
    "localities": [
      { "id": <cbs code>, "he": ..., "en": ..., "lat": ..., "lng": ...,
        "district": "north|haifa|center|jerusalem|south|js",
        "council": <hebrew regional council or null>,
        "sector": "jewish|arab|mixed",
        "pop": <int|null>,
        "benefits": { "2026": {"rate": 12, "cap": 213240}, ... } }
    ]
  }

Localities not found in the CBS file (newly founded settlements) fall back to
data/overrides.json, which carries manually curated metadata + coordinates.
"""
import json
import re
import sys
import unicodedata
from pathlib import Path

import openpyxl
from pyproj import Transformer

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OVERRIDES = ROOT / "data" / "overrides.json"
OUT = ROOT / "public" / "data" / "localities.json"


def newest_cbs() -> Path:
    """Use the newest CBS locality file (data/cbs/bycode<year>.xlsx). Drop a
    newer bycode file in and the pipeline picks it up automatically."""
    files = sorted(
        (ROOT / "data" / "cbs").glob("bycode*.xlsx"),
        key=lambda p: re.sub(r"\D", "", p.stem) or "0",
    )
    if not files:
        raise SystemExit("no data/cbs/bycode*.xlsx found")
    return files[-1]


CBS_XLSX = newest_cbs()

# 2016-2026 are extracted from per-locality tables (scripts/extract_pdf.py).
# 2011-2015 (prose format) are pending a reliable extraction; see
# data-sources/README.md and ROADMAP.md.
YEARS = [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]

# ITM (EPSG:2039) -> WGS84
TX = Transformer.from_crs(2039, 4326, always_xy=True)

DISTRICT_MAP = {
    "הצפון": "north",
    "חיפה": "haifa",
    "המרכז": "center",
    "תל אביב": "center",
    "ירושלים": "jerusalem",
    "הדרום": "south",
    "יהודה והשומרון": "js",
    "יהודה ושומרון": "js",
    "אזור יהודה ושומרון": "js",
}

# PDF text-layer artifacts and spelling drift between booklet years
NAME_FIX = {
    "קורניתצ": "קורנית",
}

# Majority-Druze localities (the CBS religion column lumps all non-Jewish
# localities together, so this distinction is curated by hand)
DRUZE = {
    "חורפיש", "בית ג'ן", "פקיעין (בוקייעה)", "כסרא-סמיע", "סאג'ור",
    "עין אל-אסד", "ירכא", "ינוח-ג'ת", "יאנוח-ג'ת", "מגאר",
    # Golan Heights Druze villages
    "מג'דל שמס", "בוקעאתא", "מסעדה", "עין קנייא",
}

GAZA_ENVELOPE_AUTH = {"אשכול", "שער הנגב", "שדות נגב", "חוף אשקלון", "שדרות"}
EILAT_ARAVA_AUTH = {"חבל אילות", "הערבה התיכונה", "אילת"}
BIKA_AUTH = {"בקעת הירדן", "ערבות הירדן", "מגילות ים המלח"}


def subregion(district, nafa, auth, lng):
    """Coarse named sub-regions for the UI filter."""
    if auth in EILAT_ARAVA_AUTH:
        return "eilat-arava"
    if auth in GAZA_ENVELOPE_AUTH:
        return "otef-aza"
    if district == "js":
        return "bika" if auth in BIKA_AUTH else "yosh"
    if nafa == "גולן":
        return "golan"
    if nafa == "צפת":
        return "galil-elyon"
    if nafa == "עכו":
        return "galil-maaravi"
    if nafa in ("כנרת", "יזרעאל"):
        return "galil-tahton"
    if nafa == "אשקלון":
        return "shfela-lachish"
    if nafa == "באר שבע":
        return "negev-mizrahi" if (lng or 0) >= 34.9 else "negev-maaravi"
    if district == "north":
        return "galil-tahton"
    if district == "south":
        return "negev-maaravi"
    return "center"


def slugify(en: str, used: set) -> str:
    s = unicodedata.normalize("NFKD", en).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-") or "yishuv"
    base, i = s, 2
    while s in used:
        s = f"{base}-{i}"
        i += 1
    used.add(s)
    return s


def norm(name: str) -> str:
    """Normalization key for joining names across sources."""
    n = NAME_FIX.get(name, name)
    n = re.sub(r"[\"'״׳]", "", n)
    n = re.sub(r"\((יישוב|שבט|ליבנה)\)", "", n)
    n = n.replace("קרית", "קריית")
    n = re.sub(r"[\s\-]+", "", n)
    return n.strip()


def parse_coords(v) -> tuple[float, float] | None:
    if v is None:
        return None
    s = str(int(v)) if isinstance(v, (int, float)) else str(v).strip()
    if len(s) < 10:
        return None
    north = int(s[-6:])
    east = int(s[:-6])
    lng, lat = TX.transform(east, north)
    if not (29.0 < lat < 33.5 and 34.0 < lng < 36.0):
        return None
    return round(lat, 5), round(lng, 5)


def load_cbs() -> dict:
    wb = openpyxl.load_workbook(CBS_XLSX, read_only=True)
    ws = wb.active
    rows = ws.iter_rows(values_only=True)
    hdr = [str(c).strip() if c else "" for c in next(rows)]
    idx = {h: i for i, h in enumerate(hdr)}

    def col(r, h):
        return r[idx[h]] if h in idx else None

    # population column header carries its reference year, e.g.
    # "סך הכל אוכלוסייה 2023 - ארעי" -> 2023
    pop_hdr = next((h for h in idx if h.startswith("סך הכל אוכלוסייה")), "")
    pop_year_m = re.search(r"(20\d{2})", pop_hdr)
    pop_year = int(pop_year_m.group(1)) if pop_year_m else None

    by_code, by_name = {}, {}
    for r in rows:
        code = col(r, "סמל יישוב")
        name = col(r, "שם יישוב")
        if not code or not name:
            continue
        name = str(name).strip()
        rel = col(r, "דת יישוב")
        pop_key = next((h for h in idx if h.startswith("סך הכל אוכלוסייה")), None)
        pop = col(r, pop_key) if pop_key else None
        arab_key = next((h for h in idx if h.startswith("ערבים")), None)
        arabs = (col(r, arab_key) if arab_key else 0) or 0
        try:
            rel = int(rel) if rel is not None else None
        except (TypeError, ValueError):
            rel = None
        if rel == 1:
            sector = "jewish"
        elif rel in (2, 3):
            sector = "arab"
        elif rel is None:
            sector = "jewish" if not arabs or (pop and arabs / pop < 0.5) else "arab"
        else:
            sector = "mixed"
        if name in DRUZE:
            sector = "druze"
        en = col(r, "שם יישוב באנגלית") or col(r, "תעתיק") or ""
        en = str(en).strip().title() if en else ""
        auth = str(col(r, "שם רשות מקומית") or "").strip() or None
        rec = {
            "id": int(code),
            "he": name,
            "en": en,
            "coords": parse_coords(col(r, "קואורדינטות")),
            "district": DISTRICT_MAP.get(str(col(r, "שם מחוז") or "").strip()),
            "council": auth,
            "nafa": (str(col(r, "שם נפה") or "").strip() or None),
            "sector": sector,
            "pop": int(pop) if pop else None,
        }
        by_code[rec["id"]] = rec
        by_name[norm(name)] = rec
    return {"by_code": by_code, "by_name": by_name, "pop_year": pop_year}


def main() -> None:
    cbs = load_cbs()
    overrides = json.loads(OVERRIDES.read_text(encoding="utf-8")) if OVERRIDES.exists() else {}

    raw = {y: json.loads((RAW / f"{y}.json").read_text(encoding="utf-8")) for y in YEARS}

    # name -> code learned from the 2022/2023 booklets themselves
    name_to_code = {}
    for y in YEARS:
        for r in raw[y]:
            if r["code"]:
                name_to_code[norm(r["name"])] = r["code"]

    localities: dict[str, dict] = {}   # keyed by norm name
    unmatched = []

    for y in YEARS:
        for r in raw[y]:
            key = norm(r["name"])
            loc = localities.get(key)
            if loc is None:
                code = r["code"] or name_to_code.get(key)
                meta = cbs["by_code"].get(code) or cbs["by_name"].get(key)
                ov = overrides.get(r["name"]) or overrides.get(key)
                if meta is None and ov is None:
                    unmatched.append((y, r["name"]))
                    continue
                base = dict(meta) if meta else {}
                if ov:
                    base.update(ov)
                    if "lat" in ov and "lng" in ov:
                        base["coords"] = (ov["lat"], ov["lng"])
                lat = base["coords"][0] if base.get("coords") else None
                lng = base["coords"][1] if base.get("coords") else None
                loc = {
                    "id": base.get("id") or code or None,
                    "he": r["name"] if NAME_FIX.get(r["name"]) is None else NAME_FIX[r["name"]],
                    "en": base.get("en", ""),
                    "lat": lat,
                    "lng": lng,
                    "district": base.get("district"),
                    "council": base.get("council"),
                    "subregion": base.get("subregion") or subregion(
                        base.get("district"), base.get("nafa"),
                        base.get("council"), lng),
                    "sector": base.get("sector"),
                    "pop": base.get("pop"),
                    "benefits": {},
                }
                localities[key] = loc
            # prefer the latest year's official spelling for display
            loc["he"] = NAME_FIX.get(r["name"], r["name"])
            b = {"rate": r["rate"], "cap": r["cap"]}
            if r.get("alt"):
                # amendment-256 rows: benefit changed mid-year; `alt` holds
                # the short opening-period terms (1.1-15.2.2023)
                b["alt"] = r["alt"]
            loc["benefits"][str(y)] = b

    # Eilat: benefit under the Eilat Free Trade Zone Law (not the Income Tax
    # Ordinance lists), 10% credit on income produced in the Eilat region.
    # Caps per Kol Zchut: 2022: 246,840; 2023: 259,800; 2024-2027: 268,560.
    eilat_meta = cbs["by_name"].get(norm("אילת"))
    if eilat_meta and norm("אילת") not in localities:
        eilat_caps = {"2022": 246840, "2023": 259800, "2024": 268560,
                      "2025": 268560, "2026": 268560}
        localities[norm("אילת")] = {
            "id": eilat_meta["id"],
            "he": "אילת",
            "en": eilat_meta["en"] or "Eilat",
            "lat": eilat_meta["coords"][0] if eilat_meta.get("coords") else None,
            "lng": eilat_meta["coords"][1] if eilat_meta.get("coords") else None,
            "district": "south",
            "council": eilat_meta.get("council"),
            "subregion": "eilat-arava",
            "sector": "jewish",
            "pop": eilat_meta.get("pop"),
            "special": "eilat",
            "benefits": {y: {"rate": 10.0, "cap": c} for y, c in eilat_caps.items()},
        }

    sorted_locs = sorted(localities.values(), key=lambda l: l["he"])
    used_slugs: set = set()
    for l in sorted_locs:
        l["slug"] = slugify(l["en"] or str(l["id"] or l["he"]), used_slugs)

    result = {
        "years": YEARS,
        "cbs": {"file": CBS_XLSX.name, "popYear": cbs.get("pop_year")},
        "localities": sorted_locs,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    # sitemap: homepage + one URL per locality permalink
    base = "https://taxmap.nx1xlab.dev"
    urls = [f"{base}/"] + [f"{base}/yishuv/{l['slug']}" for l in sorted_locs]
    sitemap = ['<?xml version="1.0" encoding="UTF-8"?>',
               '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for u in urls:
        sitemap.append(f"  <url><loc>{u}</loc></url>")
    sitemap.append("</urlset>")
    (ROOT / "public" / "sitemap.xml").write_text("\n".join(sitemap), encoding="utf-8")

    n = len(result["localities"])
    no_coords = [l["he"] for l in result["localities"] if l["lat"] is None]
    no_district = [l["he"] for l in result["localities"] if not l["district"]]
    print(f"CBS file: {CBS_XLSX.name} (population year {cbs.get('pop_year')})")
    print(f"{n} localities -> {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB)")
    if unmatched:
        print(f"UNMATCHED ({len(unmatched)}):", unmatched)
    if no_coords:
        print(f"NO COORDS ({len(no_coords)}):", no_coords)
    if no_district:
        print(f"NO DISTRICT ({len(no_district)}):", no_district)


if __name__ == "__main__":
    sys.exit(main())
