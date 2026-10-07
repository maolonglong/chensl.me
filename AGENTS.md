# AGENTS.md

chensl.me is a personal site and blog. Astro prerenders the pages to static assets on Cloudflare Workers; the Worker runs one feature, the upvote Actions on D1. This file holds the standing orders and the map. Facts live in the documents it links.

## Standing orders

- **Approval.** Local builds, previews, local D1 migrations, `pnpm exec wrangler deploy --dry-run`, and E2E runs against disposable local data need no approval. Ask before every change to shared state: a push to `main` (it deploys production), a remote D1 migration, a manual deployment, or a Cloudflare resource or dashboard change. One approval covers one action.
- **Production bindings.** A version preview URL uses the production D1. Send remote test writes only to Workers Previews, with approval.
- **Content.** Articles in `src/content/blog/` keep the author's words, emojis, dates, and credits. File and directory names are article URLs, and Astro's default heading and footnote anchors are fragment URLs, so both stay stable. `/index.xml` is the only RSS feed.
- **Source.** Edit source files, including `public/`. `dist/`, `.astro/`, `.wrangler/`, and `node_modules/` are generated.
- **Skills.** Third-party skills change only through `npx skills`, committed together with `skills-lock.json`. Project skills are the folders in `.agents/skills/` that `skills-lock.json` does not list; edit them by hand, and link each one from `.claude/skills/`.
- **Decisions.** When a change chooses between real options, removes something, or rejects a proposal, write or update an Agent Note in the same commit ([when to write one](.agents/notes/AGENTS.md#when-to-write-one)).
- **Comments.** A code comment states a contract or a surprising reason, not what the code does.
- **Documents.** Each fact has one home. A change to documented behavior updates that home in the same commit. Before you write any document, read the [documentation standard](docs/AGENTS.md).

## Map

| Before you… | Read |
| --- | --- |
| change how the site builds, serves, or runs scripts, or touch the CSP | [Architecture](docs/architecture.md) |
| change what readers see or rely on: pages, articles, feeds, exports, upvotes, comments | [Product](docs/product.md) |
| change layout, styles, fonts, or browser interactions | [Design](docs/design.md) |
| add or change a test, or choose the checks for a change | [Testing](docs/testing.md) |
| remove, replace, or reintroduce something, or propose a simplification | [Agent Notes](.agents/notes/AGENTS.md): search them for the topic first |
| write a document, an Agent Note, or a skill | [Documentation standard](docs/AGENTS.md) |

## Done

- Run the checks that [Testing](docs/testing.md#evidence-for-each-change) names for each surface you changed. Report each check you ran with its result, and each check you skipped with the reason.
- Commits follow Conventional Commits: `<type>(scope): <imperative summary>`, with an optional scope, at most 72 characters, and no trailing period. The body explains why, the verification that actually ran, and the material limits.
