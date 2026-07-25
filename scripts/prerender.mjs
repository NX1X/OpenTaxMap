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
// Injected only when a public site token is provided at build time.
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

const latestYear = String(Math.max(...data.years))
let count = 0

for (const loc of data.localities) {
  const b = loc.benefits[latestYear]
  const years = Object.keys(loc.benefits).sort()
  const rateText = b
    ? `זיכוי ${b.rate}% ממס הכנסה עד תקרת הכנסה של ${b.cap.toLocaleString('he-IL')} ש"ח בשנת ${latestYear}`
    : `הטבת מס בשנים ${years[0]}-${years[years.length - 1]}`
  const title = `${loc.he} - הטבת מס הכנסה | OpenTaxMap`
  const desc = `${loc.he} (${loc.en}) - יישוב מוטב: ${rateText}. שיעורי הזיכוי ותקרות ההכנסה לשנים 2022-2026, על מפה אינטראקטיבית.`
  const url = `${base}/yishuv/${loc.slug}`

  let html = shell
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/(<meta name="description" content=")[^"]*(")/, `$1${esc(desc)}$2`)
    .replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${esc(url)}$2`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${esc(title)}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${esc(desc)}$2`)
    .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${esc(url)}$2`)
    .replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${esc(title)}$2`)
    .replace(/(<meta name="twitter:description" content=")[^"]*(")/, `$1${esc(desc)}$2`)

  const outDir = join(dist, 'yishuv', loc.slug)
  mkdirSync(outDir, { recursive: true })
  writeFileSync(join(outDir, 'index.html'), html)
  count++
}

console.log(`prerendered ${count} locality pages under dist/yishuv/`)
