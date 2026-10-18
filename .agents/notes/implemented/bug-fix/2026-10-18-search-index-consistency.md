# Agent Note: Search index consistency across concurrent writers

Status: implemented

## Problem

D1 commits and Vectorize mutations are separate operations. A slow older request can overwrite a newer issue's vectors or delete its added items. Mutation acceptance does not prove query visibility. Purging a cached search response before the new vectors become visible permits another stale response to be cached.

## Decision

This note partly supersedes the write and cache decisions in [hybrid search](../feature/2026-10-17-hybrid-search.md). It keeps the model, vector IDs, ranking, and keyword fallback.

**News uses D1 as the authority.** `syncIssue` reads the current visible issue instead of indexing a request's payload. After submitting all mutations, it reads D1 again and repairs a changed version or visibility. This uses [Vectorize's last-upsert-wins contract](https://developers.cloudflare.com/vectorize/best-practices/insert-vectors/). Work is bounded; a failure remains explicit and a resend retries it. Vector metadata carries the D1 version. Queries exclude missing or obsolete versions before ranking, even when a mutation fails or is not yet visible. `tests/search-runtime.test.mjs` covers overlapping corrections, item-count changes, retractions, restores, and delayed visibility.

**Search responses are private and not stored.** The write path has no query-visibility receipt that can safely precede a purge. Removing response caching prevents a transient index state from becoming a long-lived answer, for both endpoint spellings. News page caching is separate and unchanged.

## Alternatives considered

**Shorten the cache TTL or purge both paths.** Both still cache an old index state after a successful purge. They bound the delay but do not establish an invalidation boundary.

**Versioned vector IDs or a queue.** Versioned IDs need cleanup and extra storage. A durable queue adds infrastructure and still needs a stale-version check. Reconciliation keeps fixed IDs and repairs successful overlapping requests. It does not promise durable recovery after a process interruption or a failed index call.

## Consequences

Search requests reach the Worker and consume query embeddings even for repeated terms. The existing read limiter bounds each client's request rate, not total daily cost. Reconsider caching only with an index-visibility boundary or an explicit accepted staleness contract.

Existing news vectors without a version are excluded until a resend or backfill rewrites them. Keyword search stays available. Run `scripts/index-news.mjs` only in a maintenance window with news writers paused from export through completion; a saved D1 snapshot is not a concurrency-safe writer. Remote backfills and their verification require separate approval.

## Reopen when

Index failures need automatic durable recovery, repeated searches threaten the free quota, or Cloudflare provides a per-mutation query-visibility receipt.
