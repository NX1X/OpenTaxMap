# Contributing to OpenTaxMap

Thanks for helping make Israeli tax-benefit data more accessible.

## Reporting a data error

The most valuable contribution. Open a
[data error issue](https://github.com/NX1X/OpenTaxMap/issues/new?template=data-error.md)
with the locality, tax year, the wrong value, the correct value, and an
official source (Tax Authority booklet, Kol Zchut, CBS). The source PDFs used
by this project are in [`data-sources/`](data-sources/).

## Development setup

```bash
npm install
npm run dev
```

Rebuilding the dataset (requires Python 3.11+):

Requires the `pdftotext` binary (poppler-utils; `sudo apt install poppler-utils`).

```bash
pip install -r requirements.txt
npm run data
```

The pipeline is documented in the README. Manual corrections (coordinates,
sector, sub-region) belong in `data/overrides.json`, not in generated files.

## Pull requests

- Keep PRs focused; one topic per PR.
- Test both languages (Hebrew RTL / English LTR), both themes, and a mobile
  viewport before submitting.
- Data changes must cite an official source in the PR description.
- Code style: match the existing code; no new dependencies without discussion.

## Translations

UI strings live in `src/i18n.js`. Hebrew is the source of truth; keep the
English mirror complete when adding strings.
