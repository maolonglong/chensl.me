# Agent Note: Search index consistency across concurrent writers

Status: implemented

## Problem

D1 commits and Vectorize mutations are separate operations. A slow older request can overwrite a newer issue's vectors or delete its added items. Mutation acceptance does not prove query visibility. Purging a cached search response before the new vectors become visible permits another stale response to be cached. A historical workflow rerun can also replace the production article set with an older build.

## Decision

This note partly supersedes the write, cache, and production job decisions in [hybrid search](../feature/2026-10-17-hybrid-search.md). It keeps the model, vector IDs, ranking, and keyword fallback.

**News uses D1 as the authority.** `syncIssue` reads the current visible issue instead of indexing a request's payload. After submitting all mutations, it reads D1 again and repairs a changed version or visibility. This uses [Vectorize's last-upsert-wins contract](https://developers.cloudflare.com/vectorize/best-practices/insert-vectors/). Work is bounded; a failure remains explicit and a resend retries it. Vector metadata carries the D1 version. Queries exclude missing or obsolete versions before ranking, even when a mutation fails or is not yet visible. `tests/search-runtime.test.mjs` covers overlapping corrections, item-count changes, retractions, restores, and delayed visibility.

**Search responses are private and not stored.** The write path has no query-visibility receipt that can safely precede a purge. Removing response caching prevents a transient index state from becoming a long-lived answer, for both endpoint spellings. News page caching is separate and unchanged.

**Article syncs confirm their own checkpoints; other writes report acceptance.** `get_by_ids` reads the applied index, which trails accepted writes. A sync that returns before its `post:<id>` checkpoints are readable lets the next sync compare against old values; a date correction that is reverted within a minute then stays in the index. `syncArticles` reads back each checkpoint that it wrote until the hash and the date match, within a fixed budget, and fails at the budget. This is a check of named vectors, not a shared watermark. It does not confirm deletes or query visibility. The global `processedUpToMutation` can advance past this client's mutation. Equality polling can miss it; ordering opaque IDs is not valid. Article CI uses the existing query evaluation and its retry budget for query visibility. This evaluation proves the labeled queries, not every changed vector or deletion. The offline news backfill reports visibility as unverified.

**Production jobs build current main on every push.** Publication depends on the clock as well as changed paths. A checkout of current `main` prevents a rerun of this workflow from replaying its event's old article set. A pre-write head check rejects builds overtaken before indexing. Per-index concurrency remains necessary for writers that have already started. Pull requests keep path filters and do not prune.

**Article dates have an independent checkpoint.** A date correction invalidates index reuse even when the embedding text hash is unchanged. Related-article hashes stay tied to embedding input, so this does not invent new related scores.

## Alternatives considered

**Shorten the cache TTL or purge both paths.** Both still cache an old index state after a successful purge. They bound the delay but do not establish an invalidation boundary.

**Versioned vector IDs or a queue.** Versioned IDs need cleanup and extra storage. A durable queue adds infrastructure and still needs a stale-version check. Reconciliation keeps fixed IDs and repairs successful overlapping requests. It does not promise durable recovery after a process interruption or a failed index call.

**Keep mutation polling as a completion gate.** A shared watermark is not a per-operation receipt and does not prove query results. Query evaluation is the observable check already available.

**Rely on the query evaluation alone for article syncs.** The labeled queries do not read the checkpoints. They pass while a stale checkpoint makes the next sync skip a change.

**Filter production runs by source paths.** A documentation-only push can publish a scheduled article. Rechecking hashes costs a build and query embeddings, but avoids silently skipping that publication.

## Consequences

Search requests reach the Worker and consume query embeddings even for repeated terms. The existing read limiter bounds each client's request rate, not total daily cost. Reconsider caching only with an index-visibility boundary or an explicit accepted staleness contract.

Existing news vectors without a version are excluded until a resend or backfill rewrites them. Keyword search stays available. Run `scripts/index-news.mjs` only in a maintenance window with news writers paused from export through completion; a saved D1 snapshot is not a concurrency-safe writer. Remote backfills and their verification require separate approval.

Article checkpoints without a date are refreshed on the next sync, even when their text hashes match. This one-time embedding work can also produce a related-article diff that needs review before publication.

Workflow edits cannot change the YAML stored in historical runs. Restrict or retire their credentials before treating old reruns as safe. Environment branch rules do not isolate a same-account Vectorize Edit token given to pull-request code. Actual token policies and any credential changes need a separate security check and approval.

## Reopen when

Index failures need automatic durable recovery, repeated searches threaten the free quota, or Cloudflare provides a per-mutation query-visibility receipt.
