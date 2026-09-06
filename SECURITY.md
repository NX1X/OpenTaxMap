# Security Policy

OpenTaxMap is a static site with no user accounts and no database, deployed
on Vercel. One Vercel Function (`api/version.mjs`) serves a version check;
analytics is Vercel Analytics, served same-origin so the
Content-Security-Policy can stay at `'self'`. No personal data is collected
or stored, and there is no server-side logging of visitor data.

I care about the security of both the project and the infrastructure it runs
on, and I welcome reports about anything you find - including issues in the
third-party services and dependencies this project relies on.

## Reporting a vulnerability

- Preferred: [GitHub security advisory](https://github.com/NX1X/OpenTaxMap/security/advisories/new)
- Alternative: [contact form](https://nx1xlab.dev/contact)

Please include steps to reproduce and the affected file, URL, or component.
You can expect an initial response within 7 days. Please do not open public
issues for security-sensitive reports.

Good-faith security research is welcome. I will not pursue action against
researchers who act in good faith, avoid privacy violations and service
disruption, and give a reasonable chance to remediate before public
disclosure.

## In scope

- The application code (client-side JS, the Vercel Function in `api/version.mjs`).
- Injection or XSS via URL parameters or the dataset.
- Security headers and Content-Security-Policy (`vercel.json`).
- The build and data pipeline (`scripts/`) - anything that could poison the
  published `localities.json`, `sitemap.xml`, or prerendered pages.
- Dependency and supply-chain issues (npm packages, GitHub Actions, the Python
  data-pipeline dependencies).
- CI/CD workflow configuration (`.github/workflows/`).

## Also welcome (adjacent infrastructure)

This project depends on external services and infrastructure. If you find a
problem in how OpenTaxMap uses or configures any of them, I want to know, even
though the root cause may sit with the provider:

- Vercel (hosting, DNS for the `taxmap.nx1xlab.dev` subdomain, Analytics).
- The basemap and data providers (OpenStreetMap, Israel Hiking Map, CARTO,
  gov.il, CBS).
- GitHub (repository, Actions, Pages).

For issues that are genuinely the provider's responsibility, I will also help
route the report upstream where I can.

## Out of scope

- The accuracy of the government tax data itself (report data errors as a
  regular [data issue](https://github.com/NX1X/OpenTaxMap/issues/new/choose)).
- Denial-of-service against a static CDN-hosted site.
- Vulnerabilities in third-party services that do not involve this project's
  own configuration or usage.

## Tooling in place

The repository runs CodeQL, OpenSSF Scorecard, Gitleaks secret scanning,
Dependency Review on pull requests, and Renovate (with expedited handling of
security advisories). See `.github/workflows/`.

## Supported versions

The deployed site always runs the latest `main`. No older versions are
supported.
