// The response protections of every page. public/_headers sets them on static assets, which never
// run the Worker; src/worker.ts sets them on Worker responses. tests/security-headers.test.mjs
// keeps both lists equal. The CSP is not here: Astro sends its own hashed policy on on-demand
// pages, and a second policy would apply on top of it.
export const securityHeaders = {
  'Permissions-Policy':
    'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=31536000',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
}

// workers.dev serves the Workers Previews and the version URLs, which copy the site.
const previewHost = (hostname) => hostname.endsWith('.workers.dev')

// Returns a copy, because a response from fetch or the ASSETS binding has immutable headers.
export function withSecurityHeaders(response, url) {
  const copy = new Response(response.body, response)
  for (const [name, value] of Object.entries(securityHeaders)) copy.headers.set(name, value)
  if (previewHost(url.hostname)) copy.headers.set('X-Robots-Tag', 'noindex')
  return copy
}
