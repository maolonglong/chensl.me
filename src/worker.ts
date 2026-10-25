import type { ExecutionContext } from '@cloudflare/workers-types'
import { handle } from '@astrojs/cloudflare/handler'
import { handleGitHubRepo } from './lib/github-endpoint'
import { handleSearch } from './lib/search'
import { withSecurityHeaders } from './lib/security-headers.mjs'

// The Worker entry (`main` in wrangler.jsonc). /api/search/ and /api/github/ are the hot Worker
// paths that need nothing from Astro, so they skip the Astro pipeline, which adds several
// milliseconds of CPU to the first request in an isolate; every other request goes to the
// adapter's handler, as with the default entry. public/_headers does not reach Worker responses,
// so every branch adds the shared protections here, after src/middleware.ts has run for Astro.
export default {
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext) {
    const url = new URL(request.url)
    const response =
      url.pathname === '/api/search/' || url.pathname === '/api/search'
        ? await handleSearch(request, env)
        : url.pathname.startsWith('/api/github/')
          ? await handleGitHubRepo(request, env)
          : await handle(request, env, ctx)
    return withSecurityHeaders(response, url)
  },
}
