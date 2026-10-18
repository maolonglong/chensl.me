import { getActionContext } from 'astro:actions'
import { defineMiddleware } from 'astro:middleware'
import { drainBody } from './lib/request-body'

export const onRequest = defineMiddleware(async (context, next) => {
  if (context.isPrerendered || !getActionContext(context).action) return next()
  // Actions contain private visitor state, including errors and Set-Cookie.
  const headers = { 'Cache-Control': 'private, no-store' }
  if (context.request.headers.get('origin') !== context.url.origin) {
    // Drain the small Action body first: local Wrangler's proxy can lose the next request on a
    // connection whose response was sent with the request body still unread. The drain is bounded
    // so a cross-origin request cannot make the Worker buffer a large body just to reject it.
    await drainBody(context.request)
    return Response.json({ message: 'Invalid request origin.' }, { status: 403, headers })
  }
  const response = await next()
  response.headers.set('Cache-Control', headers['Cache-Control'])
  return response
})
