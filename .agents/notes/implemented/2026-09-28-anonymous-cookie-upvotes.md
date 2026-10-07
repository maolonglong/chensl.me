# Agent Note: Anonymous cookie upvotes with immediate feedback

Status: implemented

## Problem

Readers had no way to show that an article helped them. The site is prerendered, has no accounts, and must not add a client framework.

## Decision

Astro Actions in `src/actions/index.ts` run on Cloudflare Workers and store votes in D1. The pages stay prerendered.

- Identity is an anonymous visitor UUID in the `__Host-blog-voter` cookie. Reads never set it. The first vote that D1 saves creates it, so a delayed read cannot replace a new identity.
- A duplicate vote is idempotent. Action responses are private and not cacheable. `src/middleware.ts` rejects cross-origin requests.
- Two rate limiters, for reads and for submissions, key on the client address. Their budgets are in `wrangler.jsonc`.
- The button follows Bear Blog. On click it increments, colors, and disables at once, without waiting for the Action. A failed submission stays silent, and a reload shows the stored state.

`e2e/upvotes.spec.mjs` asserts these behaviors; its test titles are the list.

## Alternatives considered

**Wait for the response and show inline retry feedback.** The first version (`f78824f`) did this. `bfa3a4d` replaced it: immediate feedback is simpler, and the reload reconciles the display with storage.

**Create the visitor identity on the first read.** The first version made reads depend on an initial identity, and a delayed read could replace a cookie from a first vote. `bfa3a4d` moved identity creation to the first saved vote.

## Consequences

This is not one-person-one-vote. A reader who clears cookies or switches browsers votes again, concurrent first votes without a cookie can create two identities, and a client can forge any well-formed UUID within the rate limits. D1 stores article and visitor IDs, not IP addresses. Cloudflare limiters count per location and are approximate: they slow abuse, but they are not a global quota or a bot challenge. Votes are keyed by article ID, so renaming an article orphans its votes.
