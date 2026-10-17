# Agent Note: Hybrid search and related articles on the free Workers plan

Status: implemented

## Problem

Readers cannot search the site. The archive lists titles only, and AI News adds an issue every day. Chinese queries are often a question or a concept, such as 测试时依赖数据库怎么办 or 智能体, that no article contains as a phrase, so keyword search alone misses the right article. Readers also have no path from one article to another on the same topic. The site runs on the Workers Free plan: 10 ms of CPU for each request, 10,000 Workers AI neurons for each day, and the Vectorize and D1 free quotas. A paid plan is not an option.

## Decision

`/search/` is one input and a result list. Three ranked lists merge in the browser with reciprocal rank fusion (`src/lib/search-fuse.ts`, k = 60):

- **Article keywords.** Pagefind 1.5 with its extended binary (Chinese segmentation) indexes the article pages at build time (`astro.config.mjs`). The page loads only the Pagefind JS API, not its UI. An unquoted Chinese query matches single segments, so 智能体 matched unrelated articles; when the query has no spaces, the page keeps only the ranked hits that the phrase search also returns. Pagefind compiles WebAssembly, so only `/search/` adds `'wasm-unsafe-eval'` to its script policy.
- **Semantic.** `GET /api/search` embeds the query with Workers AI `@cf/qwen/qwen3-embedding-0.6b` (1024 dimensions) and queries one Vectorize index that holds the articles (`blog:<id>`) and the AI News issues (`news:<date>`). The query instruction is Chinese; with the default instruction, 智能体 ranked a reasoning article above the agent articles. A hit counts when its score is at least 0.30 and within 0.05 of the best hit. On 2026-10-17 the best hit of every off-topic query scored at most 0.265, and every on-topic best hit at least 0.33. On the preview, a short name such as 智谱 matched its issue and also unrelated articles 0.06 to 0.10 lower; articles on one topic stayed within 0.03 of each other. A retracted issue is dropped at query time through D1.
- **AI News keywords.** Migration `0003_search.sql` adds an FTS5 table with the trigram tokenizer. Triggers keep it current from `issues`, so the write path has no FTS code. A term of three or more characters uses `MATCH`; a shorter term, common in Chinese, uses `LIKE`.

Each news write re-embeds its issue and upserts the vector (`indexIssue` in `src/lib/search.ts`). A failure is logged and reported in the reply, never thrown, so a resend repairs it. The API answers with the lists that succeeded and marks the reply partial; the page still shows the Pagefind hits.

**Related articles.** `scripts/embed-posts.mjs` embeds each article (title, description, and text without code), stores the vectors, and writes the five nearest articles with their scores and a text hash to `src/data/related-posts.json`. The article page links the nearest three at or above 0.35; on 2026-10-17 pairs above that shared a topic, and pairs below did not. `scripts/check-site.mjs` fails when an article has no entry and warns when its text changed.

**Generation is a manual step.** The embed script needs a Wrangler login with Workers AI and Vectorize access. Workers Builds and GitHub CI have no such token, and none was added, so the author runs the script after each new or changed article.

## Alternatives considered

**Embed in the build with a CI token.** The related links would never be stale, but every build would need an API token with Workers AI and Vectorize write access in two CI systems. The owner did not approve a new token.

**Bundle the article vectors into the Worker.** Semantic article search would need no Vectorize write for a new article. 17 vectors are about 350 KB of JSON, which grows the Worker with each article, and the news vectors would still need Vectorize.

**`LIKE` only for AI News.** It needs no migration, but it scans every issue and does not rank.

**One vector for each news item.** Results would point at the item, not the day, but the index would grow about ten times faster, and Vectorize bills queried dimensions by stored vectors.

**Pagefind for AI News too.** News renders on request, so it is not in the static index.

## Consequences

- `wrangler d1 export` does not support databases with virtual tables, so after `0003_search.sql` the news database needs a JSON dump of each table as its backup.
- A new article needs a manual embed run; until then it is missing from semantic search and related links, and `pnpm check` fails.
- Cost on 2026-10-17: 17 articles were about 12,200 tokens, 13 neurons; a query is about 0.03 neurons; a news write about 1.3 neurons. Vectorize counts each stored vector against each query, so about 400 vectors leave room for about 960 queries each day in the free 30 million queried dimensions each month. Over a quota, the semantic list fails and the page shows keyword results.
- Production has no `AI` or `SEARCH_INDEX` binding until the owner creates the index; there, `/api/search` returns AI News keyword hits only.
- The thresholds were set on 17 articles and one issue; recheck them when the corpus grows.
