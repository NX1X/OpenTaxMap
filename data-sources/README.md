# Data sources

The raw material behind OpenTaxMap: the official Israel Tax Authority
deduction booklets ("חוברת ניכויים"), from which the list of "yishuvim
mutavim" (localities whose residents get an income-tax credit) is taken.

Everything here is public government material. The processed dataset the site
serves is built from these files (see the pipeline in the project README).

## Folder layout

### `data-before-filter/`

The **full official booklets**, exactly as published by the Tax Authority,
one per tax year. Each booklet is a large document covering many unrelated
topics (vehicle-use value, pension ceilings, credit points, withholding
tables, and so on). The eligible-localities list is just one chapter inside
it. These are kept for provenance and verification.

### `data-after-filter/`

The **filtered** version: for each year, only the pages that actually list the
eligible localities and their credit rates and income caps, exported to
`tax-map-<year>.pdf`. This is what the extraction scripts read. Filtering only
removes irrelevant pages; the locality data itself is untouched.

## Integrity

`SOURCES.sha256` records a SHA-256 for every PDF in both folders. Verify with:

```bash
cd data-sources && sha256sum -c SOURCES.sha256
```

This matters because extracted rates can shift for two very different reasons:
the source document changed, or the same document was parsed by a different
`pdftotext` version. Without recorded digests both look identical. Regenerate
the manifest whenever a source is added or replaced:

```bash
cd data-sources
find data-before-filter data-after-filter -name '*.pdf' | sort | xargs sha256sum >> SOURCES.sha256
```

## CBS locality file (names, codes, population, coordinates)

Locality metadata (Hebrew/English names, CBS code, district, coordinates, and
population) comes from the Central Bureau of Statistics locality file, kept in
`data/cbs/bycode<year>.xlsx`. The build uses the **newest** `bycode*.xlsx`
present, so to refresh, download the latest file from CBS (the
[locality population page](https://www.cbs.gov.il/he/subjects/Pages/אוכלוסייה-ביישובים.aspx))
and drop it in `data/cbs/`. The population reference year is read from the
file's own column header and shown on the site's sources/stats.

Currently bundled: `bycode2024.xlsx` (population as of end 2023). A newer
`bycode2025.xlsx` (population end 2024) exists and can be dropped in to
upgrade.

## What the data means

For each eligible locality the booklets give:

- **rate** - the income-tax credit as a percentage of eligible (earned) income
- **cap** - the annual income ceiling the credit is calculated up to

Both vary by locality and change year to year. Residency and other conditions
apply; the binding text is the Tax Authority's own publication.

## Format changed over the years

- **2016-2026** - per-locality tables (name, rate, cap, and for 2016-2023 also
  the CBS locality code). These are extracted automatically by
  `scripts/extract_pdf.py` and are the years currently published on the site.
- **2011-2015** - published as prose: localities grouped by region, each group
  stating one rate and cap, with irregular ordering and (in some years)
  digit-corruption when extracted. A best-effort parser exists
  (`scripts/extract_prose.py`) but its output is not yet reliable enough to
  publish, so these years are held pending careful extraction and validation
  (tracked in [ROADMAP.md](../ROADMAP.md)).

## Per-year source links (gov.il)

| Year | Official booklet |
|------|------------------|
| 2026 | https://www.gov.il/BlobFolder/generalpage/income-tax-monthly-deductions-booklet/he/generalInformation_income-tax-monthly-deductions-booklet_monthly-deductions-booklet-2026.pdf#page=20 |
| 2025 | https://www.gov.il/BlobFolder/generalpage/income-tax-monthly-deductions-booklet/he/generalInformation_income-tax-monthly-deductions-booklet_monthly-deductions-booklet-2025.pdf#page=20 |
| 2024 | https://www.gov.il/BlobFolder/generalpage/income-tax-monthly-deductions-booklet/he/generalInformation_income-tax-monthly-deductions-booklet_monthly-deductions-booklet-2024.pdf#page=20 |
| 2023 | https://www.gov.il/BlobFolder/generalpage/income-tax-monthly-deductions-booklet/he/generalInformation_income-tax-monthly-deductions-booklet_monthly-deductions-booklet-2023.pdf#page=20 |
| 2022 | https://www.gov.il/BlobFolder/generalpage/income-tax-monthly-deductions-booklet/he/generalInformation_income-tax-monthly-deductions-booklet_monthly-deductions-booklet-2022.pdf#page=20 |
| 2021 | https://www.gov.il/BlobFolder/generalpage/income-tax-monthly-deductions-booklet/he/itc_itc_necuyim2021-1.pdf |
| 2020 | https://www.gov.il/BlobFolder/generalpage/income-tax-monthly-deductions-booklet/he/luachyanoar.pdf |
| 2019 | https://www.gov.il/BlobFolder/generalpage/income-tax-annual-deductions-booklet/he/luah_nikuim_shnati_2019_acc.pdf |
| 2018 | https://www.gov.il/BlobFolder/generalpage/income-tax-monthly-deductions-booklet/he/generalInformation_income-tax-monthly-deductions-booklet_luah_azer_hodshi_2018_acc.pdf |
| 2017 | https://www.gov.il/BlobFolder/generalpage/income-tax-monthly-deductions-booklet/he/generalInformation_income-tax-monthly-deductions-booklet_luah_ezer_2017_acc.pdf |
| 2016 | https://www.gov.il/BlobFolder/generalpage/income-tax-monthly-deductions-booklet/he/generalInformation_income-tax-monthly-deductions-booklet_luah_ezer_2016_acc.pdf |
| 2015 | https://www.gov.il/BlobFolder/generalpage/income-tax-monthly-deductions-booklet/he/generalInformation_income-tax-monthly-deductions-booklet_luah_ezer_2015.pdf |
| 2014 | https://www.gov.il/BlobFolder/generalpage/income-tax-monthly-deductions-booklet/he/generalInformation_income-tax-monthly-deductions-booklet_luah_ezer_2014.pdf |
| 2013 | https://www.gov.il/BlobFolder/generalpage/income-tax-monthly-deductions-booklet/he/generalInformation_income-tax-monthly-deductions-booklet_luah_ezer_2013.pdf |
| 2012 | https://www.gov.il/BlobFolder/generalpage/income-tax-monthly-deductions-booklet/he/generalInformation_income-tax-monthly-deductions-booklet_luah_ezer_2012.pdf |
| 2011 | https://www.gov.il/BlobFolder/generalpage/income-tax-annual-deductions-booklet/he/generalInformation_IncomeTaxAnnualDeductions-booklet_nikuy_2011.pdf |

Additional reference: [Tax Authority notice to employers (07/2026)](https://www.gov.il/BlobFolder/dynamiccollectorresultitem/employers-info-090726-1/he/IncomeTax_employers-info-220726-1.pdf).
