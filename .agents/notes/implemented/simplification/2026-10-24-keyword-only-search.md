# Agent Note: Keyword-only search with Pagefind and item-level D1 FTS5

Status: implemented

## Problem

`/search/` previously combined three engines: Pagefind in the browser for article keywords, Workers AI `@cf/qwen/qwen3-embedding-0.6b` with Cloudflare Vectorize for semantic article and AI News search, and a whole-issue D1 FTS5 table (`migrations/news/0003_search.sql`) for AI News keywords. The article embeddings also drove a related-articles row below each post (`fa8cdc9:src/data/related-posts.json`).

Vector search and related articles carried disproportionate operational and runtime weight for a 17-article blog on the Workers Free plan:

- Every news write, retraction, and restore had to reconcile D1 with Vectorize across separate transactions, and mutation acceptance trailed query visibility (`fa8cdc9:.github/workflows/search-index.yml`, `fa8cdc9:scripts/index-news.mjs`).
- Vectorize's Free plan caps stored dimensions at 5 million (about 4,880 vectors of 1024 dimensions), which daily news items exhaust in about 300 days.
- Writing or editing an article required an extra embedding job and a committed vector snapshot (`fa8cdc9:scripts/embed-posts.mjs`), and local development had to disable `remoteBindings` and `SEMANTIC_SEARCH` because Workers AI and Vectorize lack local simulation.
- Whole-issue FTS5 (`issues_fts`) concatenated all 15 daily news items into one row, so multi-term and Han pair fallback queries matched unrelated items across the same day. Splitting Han compounds by fixed two-character steps (`index += 2`) also cut three-character words in half (for example, `开源大模型排行` became `开源`, `大模`, and `型排`).

## Decision

This note supersedes and merges the hybrid-search and index-consistency decisions (`fa8cdc9:.agents/notes/implemented/feature/2026-10-17-hybrid-search.md`, `fa8cdc9:.agents/notes/implemented/bug-fix/2026-10-18-search-index-consistency.md`). Nothing of vector search, Vectorize, Workers AI, or related articles remains.

`/search/` is one input and one result list. Two keyword lists merge in the browser with reciprocal rank fusion (`src/lib/search-fuse.ts`, `k = 60`):

- **Article keywords.** Pagefind 1.5 indexes the built article pages at build time (`astro.config.mjs`), with zero-width spaces inserted between adjacent Han characters in memory so build-time Jieba and the browser's `Intl.Segmenter` agree on every character boundary. The page loads only the Pagefind JS API, not its UI. `articleQuery` in `src/lib/search-fuse.ts` spaces adjacent Han characters and runs each contiguous Han run of two or more characters as a quoted phrase, so `智能体` does not match articles that only contain its characters apart while Latin terms keep Pagefind's prefix matching; the plain search supplies the ranking, which phrase search lacks. Pagefind compiles WebAssembly, so only `/search/` adds `'wasm-unsafe-eval'` to its script policy. `scripts/check-site.mjs` fails the build when Pagefind indexes fewer pages than the built article count.
- **AI News keywords.** `migrations/news/0004_item_search.sql` replaces `issues_fts` with `issue_items_fts`, an FTS5 `trigram` table with one row for each news item (`rowid = day * 32 + item_index`, `date UNINDEXED`, `snippet UNINDEXED`, `body`). SQLite triggers on `issues` update the item rows synchronously inside the D1 write transaction, so `POST /api/news/` and `POST /api/news/retract/` need no search code. A term of three or more characters uses `MATCH`; a shorter term uses `LIKE` on the same item row. A Han term of four or more characters splits at word boundaries with `Intl.Segmenter('zh', { granularity: 'word' })` (or into two-character pairs when the segmenter sees one word). When the phrase query returns fewer than 10 issues (`newsKeywordLimit`), those words are required together within the same item row, and multiple matching items in one issue collapse to the best-ranked item for that date (`src/lib/search-text.mjs`, `src/lib/search.ts`). `tests/search-runtime.test.mjs` runs the migrations and queries on SQLite FTS5.
- **Endpoint.** `src/worker.ts` routes `/api/search` and `/api/search/` to `handleSearch` in `src/lib/search.ts` before the Astro handler. Responses stay `Cache-Control: private, no-store`. When `/api/search/` fails, `/search/` still shows the Pagefind article hits and marks the status as partial (`e2e/search.spec.mjs`).
- **No related articles.** Article pages end with the prose, upvote button, earlier and later article links, and comments (`src/pages/blog/[...id].astro`).

## Alternatives considered

**Keep Workers AI for articles and store Int8-quantized chunk vectors in the repository.** Quantizing the 53 article chunk vectors (1024 dimensions) to signed Int8 Base64 shrank the static index to about 95 KB and kept a top-3 recall of 15/16 (`0.9375`) with zero false positives and zero off-topic hits on `fa8cdc9:tests/fixtures/search-queries.json`, while removing Vectorize and news dual-writes. It still required a Cloudflare AI token and `fa8cdc9:scripts/embed-posts.mjs` whenever an article changed, and kept the `AI` binding on every search request. The owner chose to drop vector search completely and rely on Pagefind and D1 FTS5.

**Truncate Qwen3 embeddings to 512 Matryoshka dimensions.** Evaluated on `fa8cdc9:tests/fixtures/search-queries.json`, 512-dimension truncation inflated cosine scores across unrelated chunks and produced 4 false positives and 1 off-topic hit at the 0.36 article floor.

**Keep Vectorize for semantic search.** Vectorize required asynchronous CI checkpoint polling, a dual-write reconciliation loop on news updates, and a Free-plan storage ceiling of about 4,880 vectors.

**Pure client-side Pagefind without `/api/search/`.** AI News renders on request from D1 and is not in the static build, so a static Pagefind index cannot search news issues without a rebuild on every daily issue.

**Whole-issue FTS5 (`issues_fts`) or `LIKE` only for AI News.** Whole-issue indexing allowed two words from different news items on the same day to match together, and required the Worker to parse `items_json` to build snippets. `LIKE` alone scans every item without FTS5 trigram ranking.

**Compute related articles at build time from local text similarity.** With 17 articles and an archive page that fits on one screen, the owner preferred to remove the `.post-related` block rather than maintain a second similarity heuristic.

## Consequences

- Zero Workers AI neurons, zero Vectorize storage or query dimensions, and zero GitHub Actions secrets or Environments are used for search.
- `astro dev`, `pnpm check`, and `pnpm test:e2e` run identically against local bindings without `remoteBindings: false` or `SEMANTIC_SEARCH=off`.
- Adding or editing an article needs no post-build embedding step.
- Concept queries that share no word or phrase with the target article (such as `测试时依赖数据库怎么办` for `/blog/dockertest/`) do not match unless the reader searches terms that appear in the article (`docker`, `数据库`, `单元测试`).
- Articles show no related-articles footer below the prose.

## Reopen when

- The article archive grows large enough that keyword search misses frequent reader queries and the owner wants semantic retrieval or related articles back. Start from the Int8-quantized static chunk design in Alternatives considered rather than reintroducing Vectorize.
