# Agent Note: Bound the Action body drain

Status: implemented

## Problem

`src/middleware.ts` answers a cross-origin Action request with 403 before it calls Astro. It reads the request body first, because local Wrangler's proxy can drop the next request on a connection whose response left the body unread (`d104578`). That read, `request.arrayBuffer()`, had no cap: a cross-origin POST could make the Worker buffer a body up to the platform limit only to reject it.

The news endpoints already had a bounded drain: they read 64 KB and cancel past 1 MB (`49b6241`). The same workaround therefore had two implementations with different limits.

## Decision

`src/lib/request-body.ts` owns `readBoundedBytes(request, maxBytes)`, which reads at most the cap and cancels the stream after 1 MB. `drainBody` calls it with a zero-byte cap, so the middleware discards the body without copying it. The news gate keeps its 64 KB body limit and uses the same reader.

## Alternatives considered

**Keep `arrayBuffer()` in the middleware.** A real Action body is small, but an attacker chooses the size, and the response is a rejection either way. The unbounded read spends memory for no benefit.

**Skip the drain.** It brings back the local Wrangler failure that `d104578` fixed.

**Use the news drain in the middleware.** That reader enforces the 64 KB body limit and returns the bytes; the middleware needs neither.

## Consequences

A cross-origin Action body larger than 1 MB is cancelled rather than fully read; the 403 still returns. A body under the cap is drained as before, so local Wrangler keeps one connection for the next request.
