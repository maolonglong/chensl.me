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

See [the design guide](docs/design.md) before changing layouts or styles. Agent instructions are documented in [AGENTS.md](AGENTS.md).

### Dependency upgrades

Before evaluating or performing an upgrade from a GitHub-released dependency, collect the stable release notes between the current and target versions:

```sh
node scripts/fetch-release-notes.mjs --repo OWNER/REPO --from CURRENT_TAG --to TARGET_TAG --output PATH
```

Use `--to latest` only when targeting the latest stable release. Add `--include-prereleases` only when prerelease compatibility is in scope.

- Hugo: update `mise.toml`, `mise.lock`, and the version plus every platform checksum in `build.sh` together. Verify both `./build.sh` and `CI=true ./build.sh`.
- Node.js: update `mise.toml`, `mise.lock`, and `node-version` in `.github/workflows/ci.yml` together.

Run the deployment dry run described above after dependency changes.

### Build script

Local builds use the Hugo executable on `PATH`. Cloudflare invokes `build.sh`; in CI mode, the script downloads the pinned Hugo release into a temporary directory and verifies its SHA-256 checksum before building.

When changing `build.sh`, preserve `set -euo pipefail`, quoted paths, temporary-directory cleanup, and checksum verification. In addition to `just check`, run:

```sh
bash -n build.sh
shellcheck build.sh
./build.sh
CI=true ./build.sh
```
