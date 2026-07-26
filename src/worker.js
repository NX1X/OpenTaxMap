// Cloudflare Worker entry. Serves the static site (via the ASSETS binding)
// and proxies Cloudflare Web Analytics first-party, so the beacon and its
// reporting endpoint live under this origin. That keeps the Content-Security
// -Policy at 'self' (no third-party hosts) and makes the analytics resistant
// to third-party script blockers.
//
// Requires no secrets: the Web Analytics token is a public site token,
// injected into the HTML at build time (see scripts/prerender.mjs). If no
// token is configured, the beacon <script> is stripped and these routes are
// simply unused.

const BEACON_UPSTREAM = 'https://static.cloudflareinsights.com/beacon.min.js'
const RUM_UPSTREAM = 'https://cloudflareinsights.com/cdn-cgi/rum'
const RELEASES_API = 'https://api.github.com/repos/NX1X/OpenTaxMap/releases/latest'

// A real RUM beacon payload is a few KB. Anything larger is not a beacon, so
// reject it before spending a subrequest on forwarding it upstream.
const MAX_RUM_BODY = 64 * 1024

// Responses built here don't pass through the ASSETS pipeline, so they do not
// inherit the rules in public/_headers. These routes return JSON or JavaScript,
// never an HTML document, so a tight `default-src 'none'` CSP is the correct
// posture - stricter than the site CSP and appropriate for a non-document
// response. COOP/CORP and Permissions-Policy are set to match what the static
// asset routes already carry, so security headers are uniform regardless of
// which code path serves the response.
const BASE_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
  'permissions-policy': 'geolocation=(), camera=(), microphone=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()',
  'x-frame-options': 'DENY',
}

const withBaseHeaders = (headers) => ({ ...BASE_HEADERS, ...headers })

// 405 for a wrong method on a route that only serves one verb.
const methodNotAllowed = (allow) =>
  new Response(null, { status: 405, headers: withBaseHeaders({ allow }) })

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)

    // latest published version, proxied first-party from GitHub. Returns
    // { latest: "0.1.0" } or { latest: null } when nothing is published yet.
    if (url.pathname === '/api/version') {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return methodNotAllowed('GET, HEAD')
      }

      // Serve the constructed JSON from the edge cache so most hits never run
      // the handler body. Without this, cache-control on the Response is
      // decorative: the Worker fires on every request even though the value
      // changes at most once per release.
      const cache = caches.default
      const cached = await cache.match(request)
      if (cached) return cached

      let latest = null
      try {
        const gh = await fetch(RELEASES_API, {
          headers: { 'user-agent': 'opentaxmap', accept: 'application/vnd.github+json' },
          cf: { cacheEverything: true, cacheTtl: 1800 },
        })
        if (gh.ok) {
          const data = await gh.json()
          latest = (data.tag_name || '').replace(/^v/, '') || null
        }
      } catch {
        latest = null
      }

      const resp = new Response(JSON.stringify({ latest }), {
        headers: withBaseHeaders({
          'content-type': 'application/json',
          // Only cache a real answer; a transient null (GitHub blip) should not
          // be pinned at the edge for 30 minutes.
          'cache-control': latest ? 'public, max-age=1800' : 'no-store',
        }),
      })
      if (latest) ctx.waitUntil(cache.put(request, resp.clone()))
      return resp
    }

    // first-party analytics beacon script
    if (url.pathname === '/cf/beacon.js') {
      const upstream = await fetch(BEACON_UPSTREAM, { cf: { cacheEverything: true, cacheTtl: 86400 } })
      return new Response(upstream.body, {
        status: upstream.status,
        headers: withBaseHeaders({
          'content-type': 'application/javascript; charset=utf-8',
          'cache-control': 'public, max-age=86400',
        }),
      })
    }

    // first-party RUM collector (the beacon is configured to POST here).
    //
    // This is an unauthenticated write path, bounded on several axes: the
    // upstream is a fixed constant (never caller-controlled); the body is
    // size-capped so it cannot burn Worker CPU/subrequest quota with oversized
    // payloads; cross-site browser callers are rejected; and a per-IP rate
    // limit caps how fast any single source can drive Worker invocations, so a
    // scripted flood (which can simply omit Sec-Fetch-Site) cannot run up the
    // account's request bill. The rate limit is a Workers-native binding, so it
    // does not consume a zone WAF rate-limiting rule.
    if (url.pathname === '/cf/rum') {
      if (request.method !== 'POST') return methodNotAllowed('POST')

      const site = request.headers.get('sec-fetch-site')
      if (site && site !== 'same-origin') {
        return new Response(null, { status: 403, headers: BASE_HEADERS })
      }

      // Per-IP rate limit. Guarded so the Worker still runs if the binding is
      // absent (e.g. a `wrangler dev` without the binding configured).
      if (env.RUM_LIMITER) {
        const ip = request.headers.get('cf-connecting-ip') || 'unknown'
        const { success } = await env.RUM_LIMITER.limit({ key: ip })
        if (!success) {
          return new Response(null, { status: 429, headers: withBaseHeaders({ 'retry-after': '60' }) })
        }
      }

      const declared = Number(request.headers.get('content-length') || 0)
      if (declared > MAX_RUM_BODY) {
        return new Response(null, { status: 413, headers: BASE_HEADERS })
      }

      const body = await request.arrayBuffer()
      // Content-Length is caller-supplied, so re-check the real size.
      if (body.byteLength > MAX_RUM_BODY) {
        return new Response(null, { status: 413, headers: BASE_HEADERS })
      }

      const resp = await fetch(RUM_UPSTREAM, {
        method: 'POST',
        headers: { 'content-type': request.headers.get('content-type') || 'application/json' },
        body,
      })
      return new Response(resp.body, { status: resp.status, headers: BASE_HEADERS })
    }

    return env.ASSETS.fetch(request)
  },
}
