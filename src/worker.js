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

// Responses built here don't pass through the ASSETS pipeline, so they don't
// inherit the rules in public/_headers. Set the ones that matter explicitly.
const BASE_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
}

const withBaseHeaders = (headers) => ({ ...BASE_HEADERS, ...headers })

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    // latest published version, proxied first-party from GitHub (keeps CSP at
    // 'self' and lets the edge cache it). Returns { latest: "0.1.0" } or
    // { latest: null } when nothing is published yet.
    if (url.pathname === '/api/version') {
      try {
        const gh = await fetch(RELEASES_API, {
          headers: { 'user-agent': 'opentaxmap', accept: 'application/vnd.github+json' },
          cf: { cacheEverything: true, cacheTtl: 1800 },
        })
        let latest = null
        if (gh.ok) {
          const data = await gh.json()
          latest = (data.tag_name || '').replace(/^v/, '') || null
        }
        return new Response(JSON.stringify({ latest }), {
          headers: withBaseHeaders({
            'content-type': 'application/json',
            'cache-control': 'public, max-age=1800',
          }),
        })
      } catch {
        return new Response(JSON.stringify({ latest: null }), {
          headers: withBaseHeaders({ 'content-type': 'application/json' }),
        })
      }
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
    // This is an unauthenticated write path, so it is bounded on two axes: the
    // upstream is a fixed constant (never caller-controlled), and the body is
    // size-capped so it cannot be used to burn Worker CPU/subrequest quota with
    // oversized payloads. Cross-site callers are turned away when the browser
    // tells us it is cross-site; the header is absent on non-browser clients,
    // which are allowed through and bounded by the size cap alone.
    if (url.pathname === '/cf/rum' && request.method === 'POST') {
      const site = request.headers.get('sec-fetch-site')
      if (site && site !== 'same-origin') {
        return new Response(null, { status: 403, headers: BASE_HEADERS })
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
