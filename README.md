# chensl.me

Source for [chensl.me](https://chensl.me), a personal site and technical blog built with Hugo and deployed as Cloudflare Workers static assets.

## Setup

Hugo and Node.js versions are managed by [mise](https://mise.jdx.dev/):

```sh
mise install
corepack pnpm install --frozen-lockfile
```

The task runner, [`just`](https://github.com/casey/just), must also be installed. Python 3 is used by the site checks for XML validation; these checks use only the Python standard library.

## Development

```sh
just server  # local preview, including drafts
just build   # production build
just check   # build and run all site checks
```

After changing dependencies or Cloudflare configuration, run a deployment dry run. Wrangler runs `build.sh` and the site validation as part of this command:

```sh
corepack pnpm exec wrangler deploy --dry-run
```

Deploy only when intended:

```sh
corepack pnpm exec wrangler deploy
```

This repository's CI does not deploy the site. If Cloudflare's external Git integration is enabled, treat the Cloudflare dashboard as the source of truth for its deployment settings.

## Content and maintenance

Articles live under `content/blog`, with `title`, `date`, and `description` in front matter. Keep each article's existing front matter format. Put article-specific images in the article's page bundle and reference them with relative paths and descriptive alt text. Remote image sources must be explicitly allowed by `static/_headers`; prefer local images and ordinary repository links.

See [the design guide](docs/design.md) before changing layouts or styles. Upgrade and repository-specific instructions are documented in [AGENTS.md](AGENTS.md).
