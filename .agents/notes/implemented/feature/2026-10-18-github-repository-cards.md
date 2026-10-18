# Agent Note: GitHub repository cards with a build snapshot and a cached refresh

Status: implemented

## Problem

Several articles end a section with a paragraph that is only a link to a GitHub repository, such as the author's own project. A bare link does not tell the reader what the repository is. A card with the description helps, and the author wants the stars, forks, and archived state to stay current without a rebuild.

## Decision

`remarkSite` in `src/lib/markdown.mjs` turns a top-level paragraph that holds only a link to a repository root (`https://github.com/<owner>/<repo>`) into a card. Links inside sentences, in lists, quotes, or footnotes, to files or other GitHub pages, and paragraphs with two links stay plain.

- **Complete card at build time.** The card shows the name, an archived label, the description (two lines at most), and a stats line: language, stars, forks, and the month of the last push. The data comes from the committed snapshot `src/data/github-repos.json`, which only `scripts/github-repos.mjs` writes. A build never calls the GitHub API, so the card is complete without scripts, in RSS, and when the refresh fails.
- **Refresh through the Worker.** `src/components/GitHubCards.astro` loads only on articles with a card. It asks `/api/github/repos/<owner>/<repo>/` and replaces the text. `src/lib/github-endpoint.ts` answers before the Astro handler, like `/api/search/`.
- **Closed set.** The endpoint serves only the snapshot keys, and `scripts/check-site.mjs` fails when a key has no card. Any other path gets a 404 and never reaches GitHub, so the endpoint is not an open proxy and a query string cannot bypass the cache.
- **Cache.** Workers Cache keeps a success for an hour and serves it stale for a day while it refreshes in the background; browsers keep it for 10 minutes. The edge directive is in `CDN-Cache-Control`, because `s-maxage` disables `stale-while-revalidate` in Workers Cache. A GitHub failure returns the snapshot, marked `stale`, for five minutes, and the page keeps its build text. Only a miss runs the Worker, and a miss uses the `READ_LIMITER` budget.
- **Token.** The `GITHUB_TOKEN` secret is a read-only token for public repositories. Without it the Worker calls GitHub unauthenticated, which shares the Cloudflare egress quota and often falls back to the snapshot.
- **Search.** The description is article text for Pagefind and the embeddings. The stats line and the archived label carry `data-pagefind-ignore`, and `scripts/search-inputs.mjs` skips them, so a snapshot refresh does not change the vectors.

## Alternatives considered

**Snapshot only.** It needs no Worker code, but the numbers change only when someone runs the script.

**The browser calls `api.github.com`.** It needs a CSP change, sends each reader's address to GitHub, shares a limit of 60 requests an hour per address, and is unreliable from mainland China, where most readers are.

**Client-rendered card with a skeleton.** Readers without scripts and RSS readers see no description, and the card changes height when it loads.

**An open GitHub proxy with a token**, as some sites use. Anyone could spend the token quota through it.

**Avatars and language colors.** An avatar needs an external image or a committed copy, and a language color adds chromatic values that ink-blue links compete with.

## Consequences

The description and archived state in the HTML stay as they were at the last snapshot until the script runs again; the refresh corrects the numbers on the page only. Each article view with a card adds one Worker request, a cache hit in most cases. A new card needs a snapshot refresh before the endpoint serves it.

## Reopen when

Articles link many repositories, so the quota or the snapshot step matters, or the site drops the Worker.
