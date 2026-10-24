# Agent Note: Validate vote targets through built pages

Status: implemented

## Problem

The upvote Actions must reject IDs that are not published articles. They called `getEntry()` for this check, which pulled the whole content store, with rendered HTML, into the Worker. That chunk was 938 KB, grew with every post, and was more than half of the 1.78 MB bundle.

## Decision

`requirePost` in `src/actions/index.ts` sends a `HEAD` request for `/blog/<id>/` through the `ASSETS` binding. Prerendering omits drafts and future posts, so a built page means a published article. The request does not follow redirects and requires exactly 200: Cloudflare redirects `/blog/index/` toward the archive, and following that redirect made the archive votable (`d16b247`). The Action input accepts only slug-shaped IDs, so path syntax cannot select another page.

`scripts/check-site.mjs` fails the build when the content store in `dist/server` exceeds its 1,200,000-byte cap ([AI News](../feature/2026-10-16-bot-written-news-on-d1.md)), and when an article directory does not match the slug pattern that the Actions accept.

## Alternatives considered

**Look up the entry in the content store.** This was the previous code. It made the Worker grow with every post.

## Consequences

Removing `getEntry()` from the Actions cut the Worker upload from 1780 KiB to 747 KiB, and the Actions still must not look articles up in the content store. The AI News live collections import `astro:content`, which bundles the content store into the Worker again (924,982 bytes), guarded by the 1,200,000-byte cap in `scripts/check-site.mjs`. A new prerendered page under `/blog/<x>/` that is not an article becomes votable. An article ID outside the slug pattern cannot be voted on, and the build fails for it.
