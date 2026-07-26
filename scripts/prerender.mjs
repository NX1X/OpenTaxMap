// Post-build prerender: emits dist/yishuv/<slug>/index.html for every
// locality, with per-locality title, description, canonical and JSON-LD so
// search engines see locality-specific meta instead of the SPA shell.
// The client app then boots normally and opens the locality dialog.
//
// Run as the second half of `npm run build`, after `vite build`.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const base = 'https://taxmap.nx1xlab.dev'

let shell = readFileSync(join(dist, 'index.html'), 'utf8')
const data = JSON.parse(readFileSync(join(dist, 'data', 'localities.json'), 'utf8'))

// Cloudflare Web Analytics beacon, proxied first-party by src/worker.js.
// The public site token is provided at build time via CF_ANALYTICS_TOKEN (set
// as a build variable in Cloudflare Workers Builds), so it is not committed to
// the repo. With no token set, no beacon is injected.
const cfToken = process.env.CF_ANALYTICS_TOKEN || ''
if (cfToken) {
  const beacon = `<script defer src="/cf/beacon.js" data-cf-beacon='{"token":"${cfToken}","send":{"to":"/cf/rum"}}'></script>`
  shell = shell.replace('</head>', `  ${beacon}\n  </head>`)
  writeFileSync(join(dist, 'index.html'), shell)
  console.log('injected Cloudflare Web Analytics beacon')
} else {
  console.log('no CF_ANALYTICS_TOKEN set - analytics beacon not injected')
}

const esc = (s) => String(s)
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  // '$' is special in String.replace replacement strings ($1, $&, ...);
  // double it so escaped content is inserted literally
  .replaceAll('$', '$$$$')

// Safely serialize a JSON-LD object for embedding inside a <script> tag.
// Escapes '<', '>', '&' as unicode so the payload can never terminate the
// surrounding </script> tag, and doubles '$' for use as a replacement string.
const toLdJson = (obj) => {
  // Sanity check: throws at build time if we ever construct something that
  // isn't valid JSON (defensive - JSON.stringify output is always valid
  // JSON, but re-parsing catches programmer error early and loudly).
  const json = JSON.stringify(obj, null, 2)
  JSON.parse(json)
  return json
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026')
    .replaceAll('$', '$$$$')
}

const ldJsonBlockRe = /<script type="application\/ld\+json">[\s\S]*?<\/script>/

const latestYear = String(Math.max(...data.years))
let count = 0

for (const loc of data.localities) {
  const b = loc.benefits[latestYear]
  const years = Object.keys(loc.benefits).sort()
  const rateText = b
    ? `זיכוי ${b.rate}% ממס הכנסה עד תקרת הכנסה של ${b.cap.toLocaleString('he-IL')} ש"ח בשנת ${latestYear}`
    : `הטבת מס בשנים ${years[0]}-${years[years.length - 1]}`
  const title = `${loc.he} - הטבת מס הכנסה | OpenTaxMap`
  const desc = `${loc.he} (${loc.en}) - יישוב מוטב: ${rateText}. שיעורי הזיכוי ותקרות ההכנסה לשנים ${data.years[0]}-${data.years[data.years.length - 1]}, על מפה אינטראקטיבית.`
  const url = `${base}/yishuv/${loc.slug}`

  // Per-locality JSON-LD. This replaces the site-wide WebSite+Dataset graph
  // on every /yishuv/<slug> page with a graph naming THIS locality
  // specifically (WebPage + BreadcrumbList + Place). Google's Rich Results
  // auto-detects a "Product" out of the price-like rate/cap figures on
  // these pages when there's no other clear named entity for it to key
  // off of; giving each page its own valid, locality-named structured data
  // gives Google something unambiguous to classify the page as (a content
  // page about a place), which is the fix for the "Product snippet -
  // missing offers/review/aggregateRating/name" Search Console errors.
  // We deliberately do NOT add Product/Offer markup - this is not a store.
  const localityLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        name: 'מפת היישובים המזכים בהטבת מס הכנסה',
        alternateName: 'OpenTaxMap',
        url: `${base}/`,
        inLanguage: ['he', 'en'],
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'OpenTaxMap', item: `${base}/` },
          { '@type': 'ListItem', position: 2, name: loc.he, item: url },
        ],
      },
      {
        '@type': 'WebPage',
        name: title,
        description: desc,
        url,
        inLanguage: 'he',
        isPartOf: { '@type': 'WebSite', url: `${base}/` },
        about: {
          '@type': 'Place',
          name: loc.he,
          alternateName: loc.en,
          address: { '@type': 'PostalAddress', addressCountry: 'IL' },
          geo: { '@type': 'GeoCoordinates', latitude: loc.lat, longitude: loc.lng },
        },
      },
    ],
  }
  const ldScriptTag = `<script type="application/ld+json">\n${toLdJson(localityLd)}\n    </script>`

  let html = shell
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/(<meta name="description" content=")[^"]*(")/, `$1${esc(desc)}$2`)
    .replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${esc(url)}$2`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${esc(title)}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${esc(desc)}$2`)
    .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${esc(url)}$2`)
    .replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${esc(title)}$2`)
    .replace(/(<meta name="twitter:description" content=")[^"]*(")/, `$1${esc(desc)}$2`)
    .replace(ldJsonBlockRe, ldScriptTag)

  const outDir = join(dist, 'yishuv', loc.slug)
  mkdirSync(outDir, { recursive: true })
  writeFileSync(join(outDir, 'index.html'), html)
  count++
}

console.log(`prerendered ${count} locality pages under dist/yishuv/`)
