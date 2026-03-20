# AGENTS.md

## Build & Dev Commands

- **Install**: `pnpm install`
- **Dev server**: `pnpm dev`
- **Build**: `pnpm build`
- **Preview (Cloudflare)**: `pnpm preview`
- **Format**: `pnpm format` (Prettier)
- **Type check**: `pnpm astro check`
- No test framework is configured.

## Architecture

Astro 5 SSR blog (chensl.me) deployed to Cloudflare Workers with KV (session) and Upstash Redis (upvotes). Content lives in `src/content/blog/` (MDX/MD). Uses React for interactive components, astro-expressive-code for syntax highlighting, rehype/remark plugins for math (KaTeX), external links, and GitHub-style alerts. Path alias: `@/*` → `src/*`.

## Project Structure

- `src/pages/` — routes; `src/layouts/` — page layouts; `src/components/` — UI components
- `src/content/` — blog posts and translations (MDX/MD content collections)
- `src/actions/` — Astro server actions; `src/utils/` — helpers; `src/consts.ts` — global constants
- `src/types.ts` — shared types; `public/` — static assets; `scripts/` — build scripts

## Code Style

- **Formatter**: Prettier (no semi, single quotes, trailing commas `all`, 2-space indent)
- **Plugins**: `@prettier/plugin-oxc` (OXC-based JS/TS parser), `prettier-plugin-astro`
- **TypeScript**: strict mode with `strictNullChecks`; use `@/*` path aliases over deep relative imports
