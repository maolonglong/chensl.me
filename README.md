# chensl.me

Source for [chensl.me](https://chensl.me), a personal site and technical blog. Astro prerenders the pages to static assets on Cloudflare Workers, and a small Worker runs the article upvotes. There is no client UI framework.

## Setup

Use Node.js 26 and the pnpm version pinned in `package.json`. The tests also need Python 3, which they use as an independent HTML and XML reader.

```sh
pnpm install --frozen-lockfile
pnpm cf:types   # generate binding types from wrangler.jsonc
pnpm exec wrangler d1 migrations apply VOTES --local
```

## Development

```sh
pnpm dev        # local preview, including drafts
pnpm check      # all fast checks and the production build
pnpm test:e2e   # browser specs against a local Wrangler preview
pnpm format     # format maintained code
```

`package.json` lists every script. [Testing](docs/testing.md) explains which checks a change needs and how to run a production preview.

## Writing

Articles live in `src/content/blog/`, as `<name>.md` or `<name>/index.md`. The name is the URL, `/blog/<name>/`, so keep it stable. [`src/content.config.ts`](src/content.config.ts) defines the front matter, and the build rejects unknown fields. [Product](docs/product.md) explains drafts, scheduled posts, creation declarations, comments, and the exports.

Keep local images next to the Markdown, link them with relative paths, and give them descriptive alt text; Astro optimizes them. Put files for download in `public/downloads/`. A remote image needs its origin in both CSP policies ([Architecture](docs/architecture.md#csp)).

Markdown supports GitHub-style alerts (`> [!TIP]`), tables, footnotes, TeX math (`$…$` inline, `$$…$$` display), and code captions (`title="db/user.go"` on the fence).

JinKai font subsets are built from the source text, so new text needs no font step; restart `pnpm dev` to refresh them. Font licensing is in [NOTICE.md](public/fonts/tsanger-jinkai02/NOTICE.md).

## Deployment

Cloudflare builds and deploys production when `main` changes, and GitHub Actions only runs the checks ([Delivery](docs/architecture.md#delivery)). `pnpm run deploy` builds and deploys by hand from the local tree. `wrangler.jsonc` lists the Cloudflare resources that the Worker needs.

## For agents and maintainers

[AGENTS.md](AGENTS.md) is the entry point: standing orders and a map of the documents in [`docs/`](docs/AGENTS.md), the decision records in `.agents/notes/`, and the project skills.
