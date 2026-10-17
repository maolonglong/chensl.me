import type { ExecutionContext } from '@cloudflare/workers-types'
import { handle } from '@astrojs/cloudflare/handler'
import { handleSearch } from './lib/search-endpoint'

// The Worker entry (`main` in wrangler.jsonc). /api/search/ is the one hot Worker path that
// needs nothing from Astro, so it skips the Astro pipeline; every other request goes to the
// adapter's handler, as with the default entry.
export default {
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext) {
    if (new URL(request.url).pathname === '/api/search/') return handleSearch(request, env)
    return handle(request, env, ctx)
  },
}
