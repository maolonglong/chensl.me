# Agent Note: Bot-written AI News rendered on request from D1

Status: implemented

## Problem

The site needs a public AI News section, in the style of AINews: what happened in AI today, grouped by vendor or tool. A bot collects each daily issue and needs a place on the site to publish it. The site prerenders every page, and a production deployment follows each push to `main`. A daily publication through commits would add a bot commit and a full deployment every day, and would put machine-written text in the content collection that holds the author's articles.

## Decision

The bot writes each issue to its own D1 database (`NEWS`, `blog-news`) through `POST /api/news/`. `/news/`, `/news/<date>/`, and `/news/index.xml` render on request from D1. The rest of the site stays prerendered.

- **Plain data, not markup.** An issue is structured JSON: a title, a summary, and items with a title, a summary, a URL, and a tag. The tag is a vendor or tool name (OpenAI, Anthropic, DeepSeek, pi) in free text with its own capitalization, limited in length and characters but not to a fixed list, so a new vendor needs no code change. An issue page groups items by tag in first-appearance order. The pages and the feed escape every value, and render only `http` and `https` links. A bot that sends HTML or Markdown cannot change the page.
- **Authentication.** The endpoint compares a Bearer token with the `NEWS_TOKEN` secret in constant time, after the existing submission limiter (`VOTE_LIMITER`, with its own key prefix). Without the secret it refuses every write. `secrets.required` in `wrangler.jsonc` makes a deploy fail when the secret is missing.
- **Idempotent writes.** The date is the primary key. A repeated write reports `unchanged`, a changed one replaces the issue and keeps `created_at`, so the feed item keeps its date.
- **Retention and archive.** Issues are kept forever: there is no delete endpoint and no cleanup job, so every `/news/<date>/` URL stays valid. `/news/` shows the seven newest issues. `/news/archive/` lists months with a count, and `/news/archive/<YYYY-MM>/` lists one month. Every query has a `LIMIT` (7, 20, 31, 600 months), and each uses the `date` primary key of the `WITHOUT ROWID` table, so the schema needs no other index.
- **Separate database.** News and votes have different writers and lifetimes, so each has its own database and migrations directory. Workers Previews use `blog-news-preview`.
- **Explicit routing.** With a compatibility date after 2025-04-01, assets answer browser navigations to a missing file with the 404 page, before the Worker runs. `assets.run_worker_first` lists the Worker paths (`/_actions/*`, `/api/*`, `/news/*`). An array turns off that navigation rule, so every other missing path, including a POST, gets the 404 page from assets.
- **Edge cache.** Workers Cache (`cache.enabled`) serves the news responses for their `s-maxage`. The cache key includes the Worker version, so a deployment starts a new cache.
- **Separate feed.** `/news/index.xml` holds the issues. `/index.xml` stays the article feed, so subscribers to the author's writing do not get bot content. Each news item carries its tags as RSS categories.

## Alternatives considered

**Commit each issue as Markdown and prerender it.** This keeps the site fully static, but it adds a daily bot commit and production deployment, gives the bot write access to the repository, and mixes bot text with the author's content collection.

**Put news in the `VOTES` database.** One database is less configuration, but a migration or a restore for one feature would touch the other.

**`run_worker_first: true`.** This also reaches the Worker on navigation, but it runs the Worker for every static asset request too.

**The `assets_navigation_has_no_effect` compatibility flag.** It sends every missing path to the Worker, which then renders the 404 page for traffic that assets can answer without it.

**One archive page with every issue.** It is simpler, but the page and its query grow without bound. Month pages keep each query and page small.

**A cleanup job for old issues.** It would keep the table small, but it breaks published links, and a few hundred rows a year cost nothing in D1.

**Purge the cache on each write.** The issue appears at once, but the purge API has rate limits, and a delay of a few minutes does not matter for a daily brief.

## Consequences

The site has more server-rendered behavior: three pages and one endpoint read or write D1 at request time, so a D1 outage shows as errors on `/news/` only. A new Worker route must also go into `run_worker_first`, or browsers and POST requests get the 404 page. A new issue can take up to the `s-maxage` to appear. The JinKai subset comes from the source text, so characters that only an issue uses fall back to another font. The author does not review the bot's text before it is public; the index page says so.
