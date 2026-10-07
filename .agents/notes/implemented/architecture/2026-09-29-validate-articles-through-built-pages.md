# Agent Note: Validate vote targets through built pages

Status: implemented

## Problem

The upvote Actions must reject IDs that are not published articles. They called `getEntry()` for this check, which pulled the whole content store, with rendered HTML, into the Worker. That chunk was 938 KB, grew with every post, and was more than half of the 1.78 MB bundle.

## Decision

`requirePost` in `src/actions/index.ts` sends a `HEAD` request for `/blog/<id>/` through the `ASSETS` binding. Prerendering omits drafts and future posts, so a built page means a published article. The request does not follow redirects and requires exactly 200: Cloudflare redirects `/blog/index/` toward the archive, and following that redirect made the archive votable (`d16b247`). The Action input accepts only slug-shaped IDs, so path syntax cannot select another page.

`scripts/check-site.mjs` fails the build when a content-store chunk reaches `dist/server`, and when an article directory does not match the slug pattern that the Actions accept.

## Alternatives considered

**Look up the entry in the content store.** This was the previous code. It made the Worker grow with every post.

## Consequences

The Worker upload dropped from 1780 KiB to 747 KiB. Worker code must not import `astro:content` or `src/lib/posts.ts`. A new prerendered page under `/blog/<x>/` that is not an article becomes votable. An article ID outside the slug pattern cannot be voted on, and the build fails for it.
