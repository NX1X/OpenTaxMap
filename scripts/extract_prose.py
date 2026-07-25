#!/usr/bin/env python3
"""Extract the 2011-2015 benefit-locality lists, which the Tax Authority
published as prose (localities grouped by region, each group stating one
discount rate and income cap) rather than the per-locality tables used from
2016 on.

These are BEST-EFFORT historical extractions: the source is free text with
irregular ordering (the rate line sometimes precedes its list, sometimes
follows it), nested regional-council lists, and single localities named in
section headers. Values are validated against a few known anchors in
validate_prose(), but the canonical source remains the Tax Authority booklet.

Uses pdftotext WITHOUT -layout: for these older PDFs the layout mode mangles
the digits (bidi reordering), while the default reading-order mode keeps
numbers intact.

Output: data/raw/<year>.json (same shape as extract_pdf.py, code always null).
"""
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data-sources" / "data-after-filter"
OUT = ROOT / "data" / "raw"

PROSE_YEARS = [2011, 2012, 2013, 2014, 2015]

DIRECTIONAL = dict.fromkeys(map(ord, "‪‫‬‎‏⁦⁧⁨⁩"))

# "... discount of 12% ... up to a cap of 236,760 sh"
RE_RATE = re.compile(r"הנחה של\s*(\d{1,2}(?:\.\d)?)\s*%.*?תקרה של\s*[.:]?\s*₪?\s*([\d,]{4,})")
# a locality token: Hebrew letters/quotes/hyphen/space (parentheticals stripped)
HEB_TOKEN = re.compile(r"^[֐-ת][֐-ת'\"\-\s]*$")

# lines that are structural, never locality lists
STRUCT = re.compile(r"(פרק|סעיף|תוספת|תושב ישוב|היישובים המזכים|רשימת ישובים|בשנת המס)")

# annotations to drop from a locality name
STRIP_PARENS = re.compile(r"\([^)]*\)")
DROP_PREFIX = re.compile(r"^(תושבי|מועצה אזורית|וכן|מחנה|וכן מחנה|את הישובים|הכוללת את הישובים|הישובים הבאים)\b")


def clean_name(tok: str) -> str:
    tok = STRIP_PARENS.sub(" ", tok)
    tok = tok.replace("ותושבי", " ").replace("וכן", " ")
    tok = re.sub(r"[.:]", " ", tok)
    tok = re.sub(r"\s+", " ", tok).strip(" -")
    return tok


def looks_like_list(line: str) -> bool:
    # a locality-list line is comma-heavy Hebrew, not a structural/rate line
    if STRUCT.search(line) or "הנחה של" in line:
        return False
    return line.count(",") >= 1 or bool(HEB_TOKEN.match(line))


def tokens_from(line: str) -> list[str]:
    # keep only the part after a colon if the line is "header: a, b, c"
    if ":" in line:
        line = line.split(":", 1)[1]
    out = []
    for raw in line.split(","):
        name = clean_name(raw)
        if not name or DROP_PREFIX.match(name):
            # a council header like "מועצה אזורית ערבה תיכונה" - skip the header
            # word but its bracketed members were already split out above
            name = DROP_PREFIX.sub("", name).strip()
        if name and len(name) >= 2 and not any(c.isdigit() for c in name):
            out.append(name)
    return out


def parse_prose(year: int) -> list[dict]:
    pdf = SRC / f"tax-map-{year}.pdf"
    text = subprocess.run(
        ["pdftotext", str(pdf), "-"],
        capture_output=True, text=True, check=True,
    ).stdout.translate(DIRECTIONAL)

    lines = [re.sub(r"\s+", " ", l).strip() for l in text.splitlines()]
    lines = [l for l in lines if l]

    records: dict[str, dict] = {}
    pending_before: list[str] = []   # list tokens awaiting a following rate
    active_rate = None               # rate/cap that applies to the FOLLOWING list

    def assign(names, rate, cap):
        for n in names:
            records.setdefault(n, {"name": n, "code": None, "rate": rate, "cap": cap})

    for line in lines:
        m = RE_RATE.search(line)
        if m:
            rate = float(m.group(1))
            cap = int(m.group(2).replace(",", ""))
            if line.rstrip().endswith(":") or "יקבלו" in line:
                # rate introduces the list that follows
                active_rate = (rate, cap)
            else:
                # rate closes the list that preceded it
                assign(pending_before, rate, cap)
                pending_before = []
                active_rate = None
            continue
        if looks_like_list(line):
            toks = tokens_from(line)
            if active_rate:
                assign(toks, *active_rate)
            else:
                pending_before.extend(toks)
        else:
            # structural line: a pending "colon" rate ends at the next structure
            active_rate = None

    return list(records.values())


def validate_prose(year: int, recs: list[dict]) -> list[str]:
    """Spot-check a few well-known anchors; return a list of warnings."""
    by = {r["name"]: r for r in recs}
    warns = []
    if len(recs) < 150:
        warns.append(f"only {len(recs)} localities (expected ~300+)")
    for name in ("מטולה", "שדרות", "קרית שמונה"):
        if name not in by:
            warns.append(f"missing well-known locality {name}")
    for r in recs:
        if not (5 <= r["rate"] <= 25):
            warns.append(f"suspicious rate {r['rate']} for {r['name']}")
        if not (50_000 <= r["cap"] <= 400_000):
            warns.append(f"suspicious cap {r['cap']} for {r['name']}")
    return warns[:8]


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for year in PROSE_YEARS:
        recs = parse_prose(year)
        warns = validate_prose(year, recs)
        out = OUT / f"{year}.json"
        out.write_text(json.dumps(recs, ensure_ascii=False, indent=1), encoding="utf-8")
        status = "OK" if not warns else "WARN: " + "; ".join(warns)
        print(f"{year}: {len(recs)} localities -> {out.relative_to(ROOT)} [{status}]")


if __name__ == "__main__":
    sys.exit(main())
