import type { ExecutionContext } from '@cloudflare/workers-types'
import { handle } from '@astrojs/cloudflare/handler'
import { handleSearch } from './lib/search-endpoint'
import { withSecurityHeaders } from './lib/security-headers.mjs'

// The Worker entry (`main` in wrangler.jsonc). /api/search/ is the one hot Worker path that
// needs nothing from Astro, so it skips the Astro pipeline; every other request goes to the
// adapter's handler, as with the default entry. public/_headers does not reach Worker responses,
// so both branches add the shared protections here, after src/middleware.ts has run.
export default {
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext) {
    const url = new URL(request.url)
    const response =
      url.pathname === '/api/search/' || url.pathname === '/api/search'
        ? await handleSearch(request, env)
        : await handle(request, env, ctx)
    return withSecurityHeaders(response, url)
  },
}
