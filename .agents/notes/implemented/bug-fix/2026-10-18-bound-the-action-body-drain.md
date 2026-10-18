# Agent Note: Bound the Action body drain

Status: implemented

## Problem

`src/middleware.ts` answers a cross-origin Action request with 403 before it calls Astro. It reads the request body first, because local Wrangler's proxy can drop the next request on a connection whose response left the body unread (`d104578`). That read, `request.arrayBuffer()`, had no cap: a cross-origin POST could make the Worker buffer a body up to the platform limit only to reject it.

The news endpoints already had a bounded drain: they read 64 KB and cancel past 1 MB (`49b6241`). The same workaround therefore had two implementations with different limits.

## Decision

`src/lib/request-body.ts` owns both readers. `readBoundedBytes(request, maxBytes)` keeps at most the cap and cancels the stream after 1 MB; the news gate uses it for its 64 KB body limit. `drainBody` reads the body to its end and keeps no bytes, so the memory of a rejected request stays at one chunk. The middleware calls `drainBody`. It never cancels: on local Wrangler, a cancelled 2 MB body makes the next request on the connection fail with "Network connection lost", the failure that `d104578` fixed. The spec `a cross-origin body over 1 MB gets 403 and the connection serves the next request` in `e2e/upvotes.spec.mjs` sends 2 MB and fails when the drain cancels.

## Alternatives considered

**Keep `arrayBuffer()` in the middleware.** A real Action body is small, but an attacker chooses the size, and the response is a rejection either way. The unbounded read spends memory for no benefit.

**Skip the drain.** It brings back the local Wrangler failure that `d104578` fixed.

**Cancel the drain past 1 MB.** It also bounds the read time, but on local Wrangler it loses the next request on the connection for every body over 1 MB. A `Connection: close` header on the 403 does not help: local Wrangler keeps the connection open and the next request still fails.

**Use the news drain in the middleware.** That reader enforces the 64 KB body limit and returns the bytes; the middleware needs neither.

### Why not `security.actionBodySizeLimit`?

Astro 5.18 added [`security.actionBodySizeLimit`](https://docs.astro.build/en/reference/configuration-reference/#securityactionbodysizelimit), with a default of 1 MB. Astro applies it when the Action handler parses the body. That handler runs only after the middleware calls `next()` or `action.handler()`, as the [Actions guide](https://docs.astro.build/en/guides/actions/#gate-actions-from-middleware) shows. The cross-origin 403 returns before either call, so the limit never sees these requests. For a same-origin request, the limit answers 413 from the `Content-Length` header and leaves the body unread. On local Wrangler, the next request on that connection then fails in the same way.

## Consequences

A cross-origin Action body of any size gets the 403 after the Worker has read and discarded it. The read costs time, not memory. Cloudflare rejects a body over the plan limit (100 MB on the Free and Pro plans) with 413 before the Worker runs. The news gate still cancels past 1 MB, so on local Wrangler a news write over 1 MB can still lose the next request on its connection; a valid write is at most 64 KB.
