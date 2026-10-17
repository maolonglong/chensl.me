// A minimal Cloudflare REST client for the search scripts. It reads CLOUDFLARE_ACCOUNT_ID and
// CLOUDFLARE_EMBED_TOKEN from the environment; the token needs Workers AI and Vectorize access
// only (setup steps in .agents/notes/implemented/feature/2026-10-17-hybrid-search.md#setting-up-the-index-jobs).
// Error messages carry the API errors, never the token.
export function cloudflareFromEnv(env = process.env) {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID
  const token = env.CLOUDFLARE_EMBED_TOKEN
  const missing = [
    !accountId && 'CLOUDFLARE_ACCOUNT_ID',
    !token && 'CLOUDFLARE_EMBED_TOKEN',
  ].filter(Boolean)
  if (missing.length) throw new Error(`Set ${missing.join(' and ')} to call the Cloudflare API`)
  async function request({ method, path, query, body, contentType, rawBody }) {
    const url = new URL(`https://api.cloudflare.com/client/v4${path}`)
    for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, String(value))
    const headers = { Authorization: `Bearer ${token}` }
    const init = { method, headers }
    if (body !== undefined) {
      headers['Content-Type'] = contentType ?? 'application/json'
      init.body = rawBody ? body : JSON.stringify(body)
    }
    const response = await fetch(url, init)
    const text = await response.text()
    try {
      return JSON.parse(text)
    } catch {
      return { success: false, errors: [{ code: response.status, message: text.slice(0, 200) }] }
    }
  }
  return { accountId, request }
}
