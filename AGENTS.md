# Agent Guide for chensl.me Blog

## Project Snapshot

- Astro-based personal blog deployed on Cloudflare Pages via `@astrojs/cloudflare`
- Markdown/MDX content in `src/content/blog/` (zh-CN locale) with schema defined in `src/content.config.ts`
- React islands only when interactivity is required (e.g., `Upvote.tsx` backed by Upstash Redis)
- OG images generated with Satori components in `src/components/og/`
- Static assets (fonts, images) in `public/` or colocated with individual posts

## Core Commands

```bash
pnpm run dev          # Local development server
pnpm run build        # Production build (outputs to dist/)
pnpm run preview      # Cloudflare Wrangler preview (runs build first)
pnpm run format       # Prettier formatting with cache
pnpm run astro check  # TypeScript checking
pnpm run astro        # Run Astro CLI commands
```

**Note**: This project has no test suite. Do not add tests without confirming with the owner.

### Type Checking

Always run `pnpm run astro check` before committing to catch TypeScript errors.

## Git Commit Guidelines

- **Language**: All commit messages must be in English
- **Format**: Follow [Conventional Commits](https://www.conventionalcommits.org/) specification
  - `feat:` New features
  - `fix:` Bug fixes
  - `docs:` Documentation changes
  - `style:` Code style changes (formatting, etc.)
  - `refactor:` Code refactoring without behavior changes
  - `test:` Adding or updating tests
  - `chore:` Maintenance tasks, dependency updates
- **Scope**: Optional scope in parentheses, e.g., `feat(og): add new image generator`
- **Body**: Add detailed description if needed, wrapped at 100 characters
- **Examples**:
  ```
  feat: add GitHub-style alert blocks
  fix: resolve hydration mismatch in Upvote component
  chore(deps): update astro to v5.15.6
  docs: update deployment instructions
  ```

## Code Style Guidelines

- **Formatting**: Prettier with tabs (except JSON/MD), 100 char width, single quotes, trailing commas
  - 2 space tabs, semicolons enabled
  - MD/MDX files use 80 char width with spaces instead of tabs
- **Imports**: Sorted by React → Astro → @astrojs/_ → astro-_ → third-party → @/types → @/consts → @/\* → relative
- **TypeScript**: Strict mode enabled, use `@/*` path aliases, React JSX with `react-jsx`
- **Naming**: PascalCase for components, camelCase for functions/variables, kebab-case for files
- **Error Handling**: Use try/catch with proper typing, prefer early returns, validate with Zod in actions

## Content Workflow

- Posts live in `src/content/blog/`; directories may include `index.md` plus local assets
- Required frontmatter: `title`, `description`, `pubDate`; optional: `tags`, `draft`, `toc`
- Collection loading automatically excludes drafts and sorts by publish date
- Enable table of contents with `toc: true`; tags should remain lowercase for routing consistency
- Chinese copy is the default—respect existing tone, punctuation, and typography

## Components & Layouts

- `src/layouts/BlogPost.astro` renders individual posts; `src/layouts/Home.astro` powers the homepage
- Shared Astro UI components live in `src/components/`; React components share that directory with `.tsx` suffix
- React islands should stay minimal and encapsulate their own styling logic
- Keep OG assets and JSX helpers inside `src/components/og/` so the build step can tree-shake correctly

## Styling & Markdown Enhancements

- Global styles and CSS custom properties reside in `src/styles/global.css`, including light/dark theme tokens
- PurgeCSS strips unused selectors—prefer semantic class names and avoid dynamic string concatenation
- Expressive Code handles syntax highlighting with colorized brackets
- KaTeX (via `remarkMath` + `rehypeKatex`) renders math blocks; remember to import required CSS when adding math-heavy content
- External Markdown links should open in new tabs with `nofollow`; anchor headings are auto-linked
- Footnote labels are localized ("脚注"); preserve that wording when adding or modifying notes

## Cloudflare & Server Actions

- Server actions live in `src/actions/index.ts`, built with `defineAction` and Zod validation
- Access Cloudflare runtime with `context.locals.runtime`; session data comes through `context.session`
- Upstash Redis credentials and other secrets are provided through Cloudflare environment variables
- Redis keys are prefixed based on environment (development vs production)
- For new server logic, reuse existing patterns for error handling and rate limiting to stay edge-compatible

## Utilities & Helpers

- `getAllPosts()` returns published posts sorted by date
- `getAllTags()` extracts unique tag metadata
- `buildHierarchy()` creates TOC structures for `h2`/`h3`
- `satoriPNG()` wraps Satori image generation for OG assets

## TypeScript & Configuration

- `tsconfig.json` extends Astro's strict config
- Path aliases: `@/*` maps to `src/*`
- React 19 with `react-jsx` transform
- Server actions in `src/actions/` use `defineAction` with Zod validation
- Cloudflare Pages adapter at `@astrojs/cloudflare`

## File Organization

```
src/
├── actions/         # Server actions with defineAction
├── components/     # Astro components (.astro) and React islands (.tsx)
├── content/        # Blog content (MD/MDX) with frontmatter schema
├── layouts/        # Page layouts (BlogPost.astro, Home.astro)
├── pages/          # File-based routing
├── styles/         # Global CSS and custom properties
├── utils/          # Helper functions
└── content.config.ts # Content collection schema definitions
```

## Common Patterns

- React islands: Use `client:*` directives only when interactivity needed
- CSS: Use semantic class names, avoid dynamic concatenation for PurgeCSS compatibility
- OG Images: Satori components in `src/components/og/` for tree-shaking
- Redis: Upstash for upvote counter, keys prefixed by environment

## AI Contribution Checklist

- Prefer incremental changes with clear diffs; align with existing formatting rules (`pnpm run format`)
- Keep translations and localized strings accurate; avoid altering human-written prose without context
- Verify interactive features still hydrate correctly when introducing React changes

## Validation & QA

- For feature work, at minimum run `pnpm run build`; use `pnpm run preview` when Cloudflare behavior matters
- Confirm PurgeCSS-safe class usage and ensure assets referenced in Markdown exist
- Leave a short testing note in PRs / handoffs describing which commands or checks you ran

## Development Workflow

1. **Before starting**: Run `pnpm run dev` to start the local dev server
2. **During development**: Use `pnpm run format` to format code, `pnpm run astro check` for type checking
3. **Before committing**: Run `pnpm run build` to verify production build succeeds
4. **For Cloudflare-specific features**: Use `pnpm run preview` to test edge runtime behavior

## Environment Variables

- Redis credentials: Provided via Cloudflare environment variables
- Session secrets: Set in Cloudflare Pages settings
- Development vs production: Redis keys are prefixed accordingly
- Never commit `.env` files or secrets to the repository
