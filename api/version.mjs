// GET/HEAD /api/version - latest published release, proxied first-party from
// GitHub. Returns { latest: "0.1.0" } or { latest: null } when nothing is
// published yet. CDN-cached at the edge so a repeat request never re-runs
// this handler.

const RELEASES_API = 'https://api.github.com/repos/NX1X/OpenTaxMap/releases/latest'

export default {
  async fetch(request) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response(null, { status: 405, headers: { allow: 'GET, HEAD' } })
    }

    let latest = null
    try {
      const gh = await fetch(RELEASES_API, {
        headers: { 'user-agent': 'opentaxmap', accept: 'application/vnd.github+json' },
      })
      if (gh.ok) {
        const data = await gh.json()
        latest = (data.tag_name || '').replace(/^v/, '') || null
      }
    } catch {
      latest = null
    }

    return new Response(JSON.stringify({ latest }), {
      headers: {
        'content-type': 'application/json',
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'strict-origin-when-cross-origin',
        'content-security-policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
        'cross-origin-opener-policy': 'same-origin',
        'cross-origin-resource-policy': 'same-origin',
        // Only cache a real answer; a transient null (GitHub blip) should not
        // be pinned at the edge for 30 minutes.
        'cache-control': latest
          ? 'public, s-maxage=1800, stale-while-revalidate=3600'
          : 'no-store',
      },
    })
  },
}
