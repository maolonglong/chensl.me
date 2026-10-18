# Agent Note: Hybrid search and related articles on the free Workers plan

Status: implemented

## Problem

Readers cannot search the site. The archive lists titles only, and AI News adds an issue every day. Chinese queries are often a question or a concept, such as 测试时依赖数据库怎么办 or 智能体, that no article contains as a phrase, so keyword search alone misses the right article. Readers also have no path from one article to another on the same topic. The site runs on the Workers Free plan: 10 ms of CPU for each request, 10,000 Workers AI neurons for each day, and the Vectorize and D1 free quotas. A paid plan is not an option.

## Decision

The [consistency decision](../bug-fix/2026-10-18-search-index-consistency.md) partly supersedes the write path and response caching choices below.

`/search/` is one input and a result list. Three ranked lists merge in the browser with reciprocal rank fusion (`src/lib/search-fuse.ts`, k = 60):

- **Article keywords.** Pagefind 1.5 with its extended binary (Chinese segmentation) indexes the article pages at build time (`astro.config.mjs`). The page loads only the Pagefind JS API, not its UI. An unquoted Chinese query matches single segments, so 智能体 matched unrelated articles; when the query has no spaces, the page keeps only the ranked hits that the phrase search also returns. Pagefind compiles WebAssembly, so only `/search/` adds `'wasm-unsafe-eval'` to its script policy.
- **Semantic.** `GET /api/search` embeds the query with Workers AI `@cf/qwen/qwen3-embedding-0.6b` (1024 dimensions) and queries the `search` namespace of one Vectorize index. An article has one vector for each chunk (`blog:<id>#<n>`): the text splits at h2 and h3 headings into chunks of 800 to 1200 characters with a 150-character overlap, and each chunk starts with `title › section`. An AI News issue has one vector for each item (`news:<date>:<n>`). The Worker merges the hits by document with the best score, so a long article is found by its best section and an issue by its best item. The query instruction is Chinese; with the default instruction, 智能体 ranked a reasoning article above the agent articles. A retracted issue is dropped at query time through D1.
- **AI News keywords.** Migration `0003_search.sql` adds an FTS5 table with the trigram tokenizer. Triggers keep it current from `issues`, so the write path has no FTS code. A term of three or more characters uses `MATCH` and FTS5 `snippet()`; a shorter term, common in Chinese, uses `LIKE`.

**Ranking.** Articles and issues are ranked apart: each kind keeps the documents at or above its floor and within 0.10 of its own best document, so a strong news hit does not hide a good article. The floors are 0.36 for articles and 0.40 for issues (`tests/search.test.mjs` pins them). They come from the [calibration](#calibration). When the query has at most four characters and a keyword list has hits, the keyword hits lead and the semantic hits follow (`merge` in `src/lib/search-fuse.ts`). A short name such as 快速模式 matches its issue by keyword, and its semantic neighbours are articles that only share the vocabulary.

**Write path.** News writes, retractions, and restores reconcile the current D1 state with Vectorize through `syncIssue` in `src/lib/search.ts`. Queries check the D1 version before ranking. A failure is logged and reported in the reply, never thrown, so a resend repairs it. The search API answers with the lists that succeeded and marks the reply partial; the page still shows the Pagefind hits. The [consistency decision](../bug-fix/2026-10-18-search-index-consistency.md) records the concurrency limits and backfill requirement.

**Related articles.** Each article also has one whole-text vector (`post:<id>`, title, description, and text without code, up to 3000 characters) in the `related` namespace, which search never queries. Its metadata holds a hash of the indexed text and chunks. `src/data/related-posts.json` holds the five nearest articles with their scores and the hash. The article page links the nearest three at or above 0.35; on 2026-10-17 pairs above that shared a topic, and pairs below did not. `scripts/check-site.mjs` fails when an article has no entry and warns when its text changed.

**Generation runs in GitHub Actions.** `.github/workflows/search-index.yml` runs `scripts/embed-posts.mjs` on the built site. It reads the stored hashes and date checkpoints with `get_by_ids`, embeds new or changed articles, deletes the chunks an article lost before writing the new `post:<id>` checkpoint, and on `main` passes `--prune` to remove vectors that left the build. These asynchronous deletes can lag the site deployment. Pull requests sharing `blog-search-preview` do not prune one another's branches. The script computes the related articles and fails with a diff when the committed `src/data/related-posts.json` differs; the new file is in the job artifact, and the author commits it. CI never pushes. After mutation acceptance, `scripts/search-eval.mjs` runs the labeled queries in `tests/fixtures/search-queries.json` (also when the related file is stale) and fails below the recall floor or on an off-topic hit. A failed evaluation retries within the budget in `evaluateWithRetry`; acceptance does not prove query visibility. Production jobs run on pushes that match the workflow's index input paths. A pull request from this repository writes the preview index in the `search-preview` Environment. Production jobs use `search-production`, whose branch policy permits `main`. These jobs run automatically when `SEARCH_INDEX_ENABLED` is `true`.

**Search endpoint before Astro.** `src/worker.ts` answers both `/api/search` and `/api/search/` before it calls the Astro handler, so a search request does not load the Astro app. Search replies are private and not cached ([reason](../bug-fix/2026-10-18-search-index-consistency.md)). Each search reply has the header `X-Semantic-Search`: `on` when the AI and Vectorize bindings are present and `SEMANTIC_SEARCH` is not `off`, else `off` (`e2e/search.spec.mjs` checks `off`). A failed AI or Vectorize call shows as `partial`, not in the header.

### Setting up the index jobs

The owner does these steps once. The agent that built the jobs has no rights to do them.

1. In the Cloudflare dashboard, open My Profile › API Tokens › Create Token › Create Custom Token. Add the permissions Account › Workers AI › Read, Account › Workers AI › Edit, and Account › Vectorize › Edit. Under Account Resources, include only the chensl account. Set an end date under TTL.
2. In GitHub, open the repository Settings › Environments. Create `search-preview`. Create `search-production`, and set Deployment branches and tags to the `main` branch only. Add no required reviewers.
3. In each Environment, add the secrets `CLOUDFLARE_ACCOUNT_ID` (the chensl account ID) and `CLOUDFLARE_EMBED_TOKEN` (the token from step 1).
4. Create the production index: `wrangler vectorize create blog-search --dimensions=1024 --metric=cosine`.
5. Under Settings › Secrets and variables › Actions › Variables, add the repository variable `SEARCH_INDEX_ENABLED` with the value `true`.

Until step 5, the job is skipped and CI stays green. When a secret is missing, the job fails with a message that names the secret.

### Calibration

On 2026-10-17 the preview index held 17 articles (52 chunks) and one issue (15 items). Over 46 queries, the best off-topic article scored at most 0.335 and the best off-topic item 0.37 (今天天气怎么样). The weakest wanted article hit scored 0.365 and the weakest wanted issue 0.403. Wanted second hits were up to 0.096 below the best hit of their kind. The labeled set reached a top-3 recall of 15/16 with no false positive and no off-topic hit; 1brc-in-zig is missed for Zig 性能优化 because a Zig allocator article scores 0.10 higher. Short names such as 智谱 still draw unrelated articles at 0.38 to 0.42; the short-query rule puts the keyword hit first. The raw scores are in the pull request evidence.

## Alternatives considered

**Run the index job on every change.** Hash checks avoid embedding unchanged articles, but unrelated test, document, and skill edits still build the site and embed the evaluation queries. Path filters in `.github/workflows/search-index.yml` avoid that work. The source filter stays broad because shared components and Markdown rendering can change the text extracted from article HTML. This trades some extra runs on source changes for protection against a stale index. Dependency and build configuration changes also need that protection. A skipped workflow must not be a required PR check, because GitHub can leave its check pending.

**A manual embed run after each article.** It needs no CI token, but the author must remember the run, and an article that was deleted or renamed stayed in the index. The owner chose CI.

**Wrangler's platform proxy in CI.** It needs a Wrangler login with wide rights; the REST API takes a token that can only run models and edit Vectorize.

**One vector for each article and each issue.** The index stays small, but a long article becomes one averaged vector, and an issue vector blends fifteen unrelated items. A section of a long article or a single news item then scores below the noise.

**A `semanticEnabled` field in the reply body.** `dab09b7` removed it because no client read it. The header shows the same state to `curl -I` and leaves the JSON that the page reads unchanged.

**The Cache API in the Worker.** It adds another cache without an index-visibility boundary. Search remains uncached under the [consistency decision](../bug-fix/2026-10-18-search-index-consistency.md); news pages retain Workers Cache independently.

**Bundle the article vectors into the Worker.** 17 whole vectors are about 350 KB of JSON, which grows the Worker with each article, and the news vectors would still need Vectorize.

**`LIKE` only for AI News.** It needs no migration, but it scans every issue and does not rank.

**Pagefind for AI News too.** News renders on request, so it is not in the static index.

## Consequences

- Before every migration of a D1 database, record a Time Travel bookmark: `wrangler d1 time-travel info <database>`. `wrangler d1 export` fails for a database with an FTS5 table, but an export with `--table` for each real table works; on the preview, `issues` and `issue_versions` exported after `0003_search.sql`.
- The production index needs a one-time news backfill. The owner exports the visible issues with a Wrangler login, and `scripts/index-news.mjs` embeds them with the embed token; its header holds the commands. The news write token is never used for this. Articles fill on the first `main` run.
- Vectorize bills queried dimensions each month as (queried vectors + stored vectors) × 1024; the two terms add. With 1000 queries a month and 5,000 stored vectors, that is about 6 million, well under the free 30 million. The real limit is 5 million stored dimensions on the Free plan: about 4,880 vectors. Articles average about 3 chunks and an issue about 15 items, so items fill the index in about 300 days.
- Cost on 2026-10-17: a full article sync was about 30 neurons, an issue about 0.75, and a query about 0.03.
- Without the `AI` and `SEARCH_INDEX` bindings, as in local runs without them, `/api/search` returns AI News keyword hits only.
- Recheck the floors with `scripts/search-eval.mjs` when the corpus grows; the CI job runs it after each index update.

## Reopen when

- Stored vectors approach 4,000: keep item vectors only for the last six months and collapse each older issue to one vector of its title and summaries (`news:<date>:0`), or check whether Workers AI exposes 512-dimension Matryoshka truncation for Qwen and recalibrate.
