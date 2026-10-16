// Import only binding types: global Workers Element conflicts with the browser DOM.
type D1Database = import('@cloudflare/workers-types').D1Database
type RateLimit = import('@cloudflare/workers-types').RateLimit
type Fetcher = import('@cloudflare/workers-types').Fetcher

declare module 'cloudflare:workers' {
  export const env: Cloudflare.Env
}

// Workers' non-standard Web Crypto extension; the DOM lib that Astro pages use lacks it.
interface SubtleCrypto {
  timingSafeEqual(a: ArrayBuffer | ArrayBufferView, b: ArrayBuffer | ArrayBufferView): boolean
}
