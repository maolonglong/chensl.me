# Product

Read this before you change what readers see or rely on. Each section states a promise and names the test that guards it; the test titles hold the detailed list. How the site builds it is in [architecture](architecture.md); how it looks is in [design](design.md).

## Pages

- **Home** introduces the author. **Archive** (`/blog/`) lists published articles, grouped by year, newest first.
- **Navigation.** The site title links home. The header links the archive, AI News, and search ([decision](../.agents/notes/implemented/simplification/2026-10-17-lean-header-navigation.md), `e2e/navigation.spec.mjs`).
- **Article pages** use one reading column. An article with at least three H2 or H3 headings gets a contents list (`tests/markdown.test.mjs`, `e2e/contents.spec.mjs`).
- **Length.** The article header shows the approximate length and reading time after the date, and the JSON-LD carries the exact `wordCount`. Reading time assumes 300 Chinese characters or 238 English words a minute. Code blocks and display math do not count (`tests/reading-time.test.mjs`, `e2e/reading-time.spec.mjs`).
- **Stale notice.** An article whose last modification (`updatedDate`, else `pubDate`) is more than two calendar years old shows a notice under its header. The browser checks the current date on each visit, so the notice appears when the article crosses two years, with no rebuild. The build also marks articles that were already stale, so a visitor whose clock is behind the build time still sees the notice (`tests/stale.test.mjs`, `e2e/page-shell.spec.mjs`).
- **Search** (`/search/`) finds articles and AI News by keyword and meaning, and omits weak matches. Article keyword hits survive a server failure (`e2e/search.spec.mjs`).
- **Repository cards.** A paragraph that is only a GitHub repository link shows a card. The page refreshes its numbers and keeps the build text on failure (`e2e/github-cards.spec.mjs`).
- **Related articles.** An article links up to three close articles after its text, or none (`e2e/search.spec.mjs`).
- **Share previews.** A shared article link shows a large card with the article title. The home page and the archive have fixed cards. AI News issues share one card, and the news archive pages share another (`tests/document.test.mjs`, `e2e/news.spec.mjs`).

## Articles and publication

- The file or directory name under `src/content/blog/` is the article ID and its URL, `/blog/<id>/`. A rename moves the URL and orphans the article's votes and its giscus thread, which giscus maps by path.
- Drafts and future-dated articles appear only in `pnpm dev`. A scheduled article appears after the next production build; nothing rebuilds on a timer (`tests/content.test.mjs`).
- Unknown front matter fields fail the build, so a misspelled `draft` cannot publish an article (`tests/content.test.mjs`).

## Creation declarations

The optional `creation` field declares how the author made the article: `handmade` (手作, no generative AI), `ai-assisted` (AI 辅助, the author leads and AI assists), or `ai-generated` (AI 生成, AI drafted most of the prose). An optional `creation.note` describes the involvement in plain text.

- The declaration comes from the author. It is not an automated assessment, and a label makes no claim about human review.
- Without `creation`, the article shows nothing.
- Set `creation` on an existing article only from the author's own declaration, never from its date or writing style.

The page, the RSS item, and the Markdown export show the same declaration, and the article body stays unchanged (`e2e/creation.spec.mjs`).

## Feeds and exports

- `/index.xml` is the only article feed. It lists the 20 newest published articles, and each item carries the rendered article with absolute URLs (`tests/content.test.mjs`, `tests/markdown.test.mjs`).
- `/news/index.xml` lists the 20 newest AI News issues, with their tags as categories, and no articles (`e2e/news.spec.mjs`).
- The footer of every page links `/index.xml`. AI News pages link `/news/index.xml` there instead (`scripts/check-site.mjs`, `e2e/news.spec.mjs`).
- Each published article has a Markdown export at `/blog/<id>/index.md`: a metadata header, then the original body. Its local images are published at their original paths, so relative links resolve (`tests/content.test.mjs`).
- `/llms.txt` lists the exports for readers and agents (`tests/content.test.mjs`).
- The exports and `/llms.txt` are UTF-8, and `public/_headers` must say so: browsers on a Chinese-locale system read text without a charset as GBK (`tests/check-site.test.mjs`).

## Upvotes

A reader can upvote an article once per browser identity ([decision](../.agents/notes/implemented/feature/2026-09-28-anonymous-cookie-upvotes.md)). `e2e/upvotes.spec.mjs` guards the behavior.

- The button responds at once and does not wait for the server. The display is not a confirmation that the vote was saved; a reload shows the stored state.
- Votes are anonymous. The site stores article and visitor IDs, not IP addresses.
- This is not one-person-one-vote: clearing cookies or switching browsers allows another vote.

## AI News

AI News is a public section: what happened in AI each day. `e2e/news.spec.mjs` guards the behavior.

- **Pages.** `/news/` shows the latest issue, grouped by tag in first-appearance order, with links to the archive. `/news/<date>/` shows one issue the same way. `/news/archive/` lists the months; `/news/archive/<YYYY-MM>/` lists that month's issues with their tags.
- **Writes.** A bot publishes through `POST /api/news/` with no draft step. Each changed write adds a version and the newest is shown; a repeated write changes nothing. Issues are never deleted.
- **Retraction.** `POST /api/news/retract/` hides a day from the pages and feed, and can restore it.
- **Display.** A tag names a vendor or a tool, such as OpenAI or DeepSeek, and keeps its capitalization. Issues are plain text: markup shows as text, and items link only to `http` or `https` URLs. Edge caching can delay a new issue by a few minutes.
- **Review.** The author does not review each item; the index page says so ([decision](../.agents/notes/implemented/feature/2026-10-16-bot-written-news-on-d1.md)).

## Comments

Articles show giscus comments from GitHub Discussions unless the front matter sets `comments: false` (`tests/content.test.mjs`).
