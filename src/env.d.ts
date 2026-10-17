// Import only binding types: global Workers Element conflicts with the browser DOM.
type D1Database = import('@cloudflare/workers-types').D1Database
type RateLimit = import('@cloudflare/workers-types').RateLimit
type Fetcher = import('@cloudflare/workers-types').Fetcher
type Ai = import('@cloudflare/workers-types').Ai
type Vectorize = import('@cloudflare/workers-types').Vectorize

// `wrangler types` reads only the top-level bindings. The search bindings exist only in Workers
// Previews (`previews` in wrangler.jsonc), so they are optional and the code checks for them.
declare namespace Cloudflare {
  interface Env {
    AI?: Ai
    SEARCH_INDEX?: Vectorize
  }
}

declare module 'cloudflare:workers' {
  export const env: Cloudflare.Env
}

// Workers' non-standard Web Crypto extension; the DOM lib that Astro pages use lacks it.
interface SubtleCrypto {
  timingSafeEqual(a: ArrayBuffer | ArrayBufferView, b: ArrayBuffer | ArrayBufferView): boolean
}
