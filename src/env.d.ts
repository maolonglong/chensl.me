// Import only binding types: global Workers Element conflicts with the browser DOM.
type D1Database = import('@cloudflare/workers-types').D1Database
type RateLimit = import('@cloudflare/workers-types').RateLimit
type Fetcher = import('@cloudflare/workers-types').Fetcher
type Ai = import('@cloudflare/workers-types').Ai
// `wrangler types` names the Vectorize binding VectorizeIndex; the V2 API is Vectorize.
type VectorizeIndex = import('@cloudflare/workers-types').Vectorize

// Set only by local runs (`wrangler dev --var SEMANTIC_SEARCH:off`); see semanticEnabled.
declare namespace Cloudflare {
  interface Env {
    SEMANTIC_SEARCH?: string
  }
}

declare module 'cloudflare:workers' {
  export const env: Cloudflare.Env
  // Workers Cache purge from code; absent in runtimes without Workers Cache.
  export const cache: import('@cloudflare/workers-types').CacheContext | undefined
}

// Workers' non-standard Web Crypto extension; the DOM lib that Astro pages use lacks it.
interface SubtleCrypto {
  timingSafeEqual(a: ArrayBuffer | ArrayBufferView, b: ArrayBuffer | ArrayBufferView): boolean
}
