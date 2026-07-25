#!/usr/bin/env python3
"""Extract the "yishuvim mutavim" (benefit localities) tables from the
Israel Tax Authority PDF booklets into per-year JSON files.

Input : data-sources/tax-map-<year>.pdf
Output: data/raw/<year>.json  ->  [{"name": str, "code": int|None,
                                    "rate": float, "cap": int}]

2022-2023 PDFs include the CBS locality code column; 2024-2026 do not.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data-sources" / "data-after-filter"
OUT = ROOT / "data" / "raw"

# 2016-2026 are per-locality tables; 2011-2015 are prose (grouped lists) and
# are handled by scripts/extract_prose.py instead.
TABLE_YEARS = list(range(2016, 2027))
# years whose table carries the CBS locality-code column
CODE_YEARS = {2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023}

# strip RTL/LTR embedding + pop directional marks that pdftotext emits
DIRECTIONAL = dict.fromkeys(map(ord, "‪‫‬‎‏⁦⁧⁨⁩"))

RE_PAIR = re.compile(r"(\d{2,3},\d{3})\s+(\d{1,2}(?:\.\d)?)%")
RE_CODE = re.compile(r"\b(\d{1,4})\b")
RE_HEB = re.compile(r"[(֐-׿][֐-׿\s'\"\-()]*")
RE_HEB_CHAR = re.compile(r"[֐-׿]")
# lines that are table headers / prose, not data
SKIP_PAT = re.compile(
    r"(שם יישוב|סמל היישוב|תקרה|שיעור|פרק |נוספו|טבלת|מופיעים|בכתב מודגש|רשימות|רשימת|נספח|ללא שינוי|שם ה?יישוב|תושב ישוב)"
)
# The 2021 table splits its column header over three rows that carry no
# keyword SKIP_PAT can catch: a row of repeated "ועד" (period "until"), a row
# of dates, and a row of parenthesised column numbers. Left unhandled they are
# treated as a wrapped locality name and glued onto the first data row
# (producing e.g. "() () () () אביבים"). Match them structurally instead.
RE_HEADER_ROW = re.compile(
    r"^\s*(?:"
    r"(?:\(\)\s*\d+\s*)+"                      # "()4  ()3  ()2  ()1"
    r"|(?:ועד\s*)+"                            # "ועד  ועד  ועד  ועד"
    r"|(?:\d{1,2}\.\d{1,2}\.\d{2,4}\s*)+"      # "31.12.2021  6.7.2021"
    r")$"
)


def hebrew_name(line: str) -> str:
    parts = RE_HEB.findall(line)
    # RE_HEB's class starts with "(", so a stray bracket left by the layout
    # pass matches as a part of its own and would be glued onto the name
    # (2021 produced e.g. "() () () () אביבים"). Keep only parts that contain
    # an actual Hebrew letter, so real parentheticals such as "(שבט)" or
    # "(ד'הרה)" survive, then clear any empty pair left inside a part.
    parts = [p.strip() for p in parts if RE_HEB_CHAR.search(p)]
    name = " ".join(p for p in parts if p)
    name = re.sub(r"\(\s*\)", " ", name)
    return re.sub(r"\s+", " ", name).strip(" -")


def parse_year(year: int) -> list[dict]:
    pdf = SRC / f"tax-map-{year}.pdf"
    text = subprocess.run(
        ["pdftotext", "-layout", str(pdf), "-"],
        capture_output=True, text=True, check=True,
    ).stdout.translate(DIRECTIONAL)

    has_code = year in CODE_YEARS
    records: list[dict] = []
    pending_fragment = ""   # hebrew-only line seen just before a numbers line
    last_incomplete = None  # record whose name may continue on the next line

    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            pending_fragment = ""
            last_incomplete = None
            continue
        if SKIP_PAT.search(line) or RE_HEADER_ROW.match(line):
            pending_fragment = ""
            last_incomplete = None
            continue

        pairs = RE_PAIR.findall(line)

        if pairs:
            # chapter-ט style rows carry two (cap, rate) pairs: the leftmost
            # is the post-amendment period covering most of the year, the
            # second the short opening period
            cap = int(pairs[0][0].replace(",", ""))
            rate = float(pairs[0][1])
            rest = RE_PAIR.sub(" ", line)
            code = None
            if has_code:
                cm = RE_CODE.search(rest)
                if cm:
                    code = int(cm.group(1))
                    rest = rest.replace(cm.group(0), " ", 1)
            name = hebrew_name(rest)
            if pending_fragment:
                # A Hebrew fragment on the preceding line belongs to this
                # record only when the row carries no name of its own (a true
                # wrap), or when the row continues a parenthetical such as
                # "(שבט)". Every other case measured across 2016-2026 is
                # leftover column-header text ("לשנת לשנת היישוב", "ועד ועד
                # היישוב"), which must not be glued onto the locality name.
                if not name or name.startswith("("):
                    name = f"{pending_fragment} {name}".strip()
                pending_fragment = ""
            rec = {"name": name, "code": code, "rate": rate, "cap": cap}
            if len(pairs) > 1:
                rec["alt"] = {
                    "rate": float(pairs[1][1]),
                    "cap": int(pairs[1][0].replace(",", "")),
                }
            records.append(rec)
            last_incomplete = rec
        else:
            # hebrew-only line: "(...)" continues the previous record's
            # wrapped name; anything else starts the next record's name
            frag = hebrew_name(line)
            if not frag or frag in ("סמל", "היישוב", "היישוב סמל", "סמל היישוב"):
                continue
            if frag.startswith("(") and last_incomplete is not None:
                last_incomplete["name"] = f"{last_incomplete['name']} {frag}".strip()
                last_incomplete = None
            else:
                pending_fragment = frag
                last_incomplete = None

    # de-dup by name, keeping the first occurrence. In the multi-appendix
    # years (2019-2021) a locality can reappear under transition terms in a
    # later appendix; the canonical full-year entry is in appendix alef, which
    # comes first, so first-wins is correct.
    seen = set()
    unique = []
    for r in records:
        if r["name"] and r["name"] not in seen:
            seen.add(r["name"])
            unique.append(r)
    return unique


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for year in TABLE_YEARS:
        recs = parse_year(year)
        out = OUT / f"{year}.json"
        out.write_text(json.dumps(recs, ensure_ascii=False, indent=1), encoding="utf-8")
        n_code = sum(1 for r in recs if r["code"])
        print(f"{year}: {len(recs)} localities ({n_code} with CBS code) -> {out.relative_to(ROOT)}")


if __name__ == "__main__":
    sys.exit(main())
