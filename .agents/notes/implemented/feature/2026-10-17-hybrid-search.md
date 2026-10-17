# Agent Note: Hybrid search and related articles on the free Workers plan

Status: implemented

## Problem

Readers cannot search the site. The archive lists titles only, and AI News adds an issue every day. Chinese queries are often a question or a concept, such as 测试时依赖数据库怎么办 or 智能体, that no article contains as a phrase, so keyword search alone misses the right article. Readers also have no path from one article to another on the same topic. The site runs on the Workers Free plan: 10 ms of CPU for each request, 10,000 Workers AI neurons for each day, and the Vectorize and D1 free quotas. A paid plan is not an option.

## Decision

`/search/` is one input and a result list. Three ranked lists merge in the browser with reciprocal rank fusion (`src/lib/search-fuse.ts`, k = 60):

- **Article keywords.** Pagefind 1.5 with its extended binary (Chinese segmentation) indexes the article pages at build time (`astro.config.mjs`). The page loads only the Pagefind JS API, not its UI. An unquoted Chinese query matches single segments, so 智能体 matched unrelated articles; when the query has no spaces, the page keeps only the ranked hits that the phrase search also returns. Pagefind compiles WebAssembly, so only `/search/` adds `'wasm-unsafe-eval'` to its script policy.
- **Semantic.** `GET /api/search` embeds the query with Workers AI `@cf/qwen/qwen3-embedding-0.6b` (1024 dimensions) and queries the `search` namespace of one Vectorize index. An article has one vector for each chunk (`blog:<id>#<n>`): the text splits at h2 and h3 headings into chunks of 800 to 1200 characters with a 150-character overlap, and each chunk starts with `title › section`. An AI News issue has one vector for each item (`news:<date>:<n>`). The Worker merges the hits by document with the best score, so a long article is found by its best section and an issue by its best item. The query instruction is Chinese; with the default instruction, 智能体 ranked a reasoning article above the agent articles. A retracted issue is dropped at query time through D1.
- **AI News keywords.** Migration `0003_search.sql` adds an FTS5 table with the trigram tokenizer. Triggers keep it current from `issues`, so the write path has no FTS code. A term of three or more characters uses `MATCH` and FTS5 `snippet()`; a shorter term, common in Chinese, uses `LIKE`.

**Ranking.** Articles and issues are ranked apart: each kind keeps the documents at or above its floor and within 0.10 of its own best document, so a strong news hit does not hide a good article. The floors are 0.36 for articles and 0.40 for issues (`tests/search.test.mjs` pins them). They come from the [calibration](#calibration). When the query has at most four characters and a keyword list has hits, the keyword hits lead and the semantic hits follow (`merge` in `src/lib/search-fuse.ts`). A short name such as 快速模式 matches its issue by keyword, and its semantic neighbours are articles that only share the vocabulary.

**Write path.** Each write of a visible news issue re-embeds its items, upserts them, and deletes the vectors of items that the issue lost (`indexIssue` in `src/lib/search.ts`). A retraction, or a write to a retracted issue, deletes the vectors of the issue, and a restore indexes it again. A failure is logged and reported in the reply, never thrown, so a resend repairs it. The API answers with the lists that succeeded and marks the reply partial; the page still shows the Pagefind hits.

**Related articles.** Each article also has one whole-text vector (`post:<id>`, title, description, and text without code, up to 3000 characters) in the `related` namespace, which search never queries. Its metadata holds a hash of the indexed text and chunks. `src/data/related-posts.json` holds the five nearest articles with their scores and the hash. The article page links the nearest three at or above 0.35; on 2026-10-17 pairs above that shared a topic, and pairs below did not. `scripts/check-site.mjs` fails when an article has no entry and warns when its text changed.

**Generation runs in GitHub Actions.** `.github/workflows/search-index.yml` runs `scripts/embed-posts.mjs` on the built site. It reads the stored hashes with `get_by_ids`, embeds only new or changed articles, deletes the chunks an article lost before writing the new `post:<id>` hash, and on `main` passes `--prune` to delete every `post:` and `blog:` vector whose article or chunk left the build. A deleted, renamed, or draft article therefore never stays in search as a 404, while pull requests sharing `blog-search-preview` do not prune one another's branches. The script then computes the related articles and fails with a diff when the committed `src/data/related-posts.json` differs; the new file is in the job artifact, and the author commits it. CI never pushes. After the writes are applied, `scripts/search-eval.mjs` runs the labeled queries in `tests/fixtures/search-queries.json` (also when `src/data/related-posts.json` is stale) and fails below the recall floor or on an off-topic hit. Queries see a write minutes after Vectorize reports it applied: on 2026-10-17 a new production index answered 4 of 16 labeled queries with no hits right after its first write. So a failed evaluation runs again after growing delays, for at most five minutes (`evaluateWithRetry` in `scripts/search-index.mjs`), before the job fails. A pull request from a branch of this repository writes the preview index in the `search-preview` Environment. A push to `main` writes the production index in the `search-production` Environment, which only `main` can use. The run needs no approval: the owner chose a simple setup, and only commits on `main` reach that Environment's token. The scripts call the Workers AI and Vectorize REST APIs with one account-scoped token; they do not use Wrangler. The job runs only when the repository variable `SEARCH_INDEX_ENABLED` is `true`.

**Search endpoint before Astro.** `src/worker.ts` answers `/api/search` before it calls the Astro handler, so a search request does not load the Astro app. A complete reply is cached for an hour by Workers Cache (`cache` in `wrangler.jsonc`; the key holds the query and the Worker version, so a deploy starts a new cache). A news write or retraction purges the `/api/search/` prefix. A partial reply is never cached.

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

**A manual embed run after each article.** It needs no CI token, but the author must remember the run, and an article that was deleted or renamed stayed in the index. The owner chose CI.

**Wrangler's platform proxy in CI.** It needs a Wrangler login with wide rights; the REST API takes a token that can only run models and edit Vectorize.

**One vector for each article and each issue.** The index stays small, but a long article becomes one averaged vector, and an issue vector blends fifteen unrelated items. A section of a long article or a single news item then scores below the noise.

**The Cache API in the Worker.** Workers Cache sits in front of the Worker and needs no code on the hit path. The Cache API adds code and a second cache. Workers Previews on `workers.dev` have no Workers Cache, so the cache is measurable only in production.

**Bundle the article vectors into the Worker.** 17 whole vectors are about 350 KB of JSON, which grows the Worker with each article, and the news vectors would still need Vectorize.

**`LIKE` only for AI News.** It needs no migration, but it scans every issue and does not rank.

**Pagefind for AI News too.** News renders on request, so it is not in the static index.

## Consequences

- Before every migration of a D1 database, record a Time Travel bookmark: `wrangler d1 time-travel info <database>`. `wrangler d1 export` fails for a database with an FTS5 table, but an export with `--table` for each real table works; on the preview, `issues` and `issue_versions` exported after `0003_search.sql`.
- The production index needs a one-time news backfill. The owner exports the visible issues with a Wrangler login, and `scripts/index-news.mjs` embeds them with the embed token; its header holds the commands. The news write token is never used for this. Articles fill on the first `main` run.
- Vectorize bills queried dimensions each month as (queried vectors + stored vectors) × 1024; the two terms add. With 1000 queries a month and 5,000 stored vectors, that is about 6 million, well under the free 30 million. The real limit is 5 million stored dimensions on the Free plan: about 4,880 vectors.
- Capacity plan: articles need about 3 chunks each, and an issue about 15 items, so items fill the index in about 300 days. Before the index passes 4,000 vectors, keep item vectors only for the last six months and collapse each older issue to one vector of its title and summaries (`news:<date>:0`). The alternative is Matryoshka truncation to 512 dimensions, which doubles the room; the Qwen model card lists it, but the Workers AI model page offers no dimension option, so it needs a check and a new calibration first.
- Cost on 2026-10-17: a full article sync was about 30 neurons, an issue about 0.75, and a query about 0.03.
- Without the `AI` and `SEARCH_INDEX` bindings, as in local runs without them, `/api/search` returns AI News keyword hits only.
- Recheck the floors with `scripts/search-eval.mjs` when the corpus grows; the CI job runs it after each index update.
