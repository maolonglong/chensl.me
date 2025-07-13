# Copilot Instructions for chensl.me Blog

## Architecture Overview

This is an **Astro-based personal blog** deployed on **Cloudflare Pages** with the following key characteristics:

- Static site with server-side features via Cloudflare adapter
- Content stored as Markdown/MDX files in `src/content/blog/`
- React components for interactive features (upvote system)
- Redis-backed post upvotes using Upstash
- OG image generation with Satori
- Chinese language content (zh-CN locale)

## Core Development Patterns

### Content Management

- Blog posts live in `src/content/blog/` with frontmatter schema defined in `src/content.config.ts`
- Required frontmatter: `title`, `description`, `pubDate`, optional: `tags`, `draft`, `toc`
- Posts can be organized in subdirectories with assets (images, etc.)
- Content collection automatically filters out drafts and sorts by publish date

### Component Architecture

- **Layouts**: `BlogPost.astro` for posts, `Home.astro` for homepage
- **React Components**: Only for interactivity (e.g., `Upvote.tsx`)
- **Astro Components**: Static UI (`Header.astro`, `Footer.astro`, etc.)
- **OG Images**: Generated components in `src/components/og/` using Satori

### Styling Approach

- CSS custom properties in `src/styles/global.css` with light/dark theme support
- Font stack prioritizes Chinese fonts (`PingFang SC`) before fallbacks
- Custom mono font: `JetBrains Maple Mono` loaded from assets
- PurgeCSS integration removes unused styles

### Math and Markdown Enhancement

- KaTeX for math rendering (`remarkMath` + `rehypeKatex`)
- Auto-linked headings with anchor links
- External links open in new tabs with `nofollow`
- Expressive Code for syntax highlighting with colorized brackets

## Key Commands

```bash
pnpm run dev          # Start dev server
pnpm run build        # Build for production
pnpm run preview      # Build + preview with Wrangler (Cloudflare)
pnpm run format       # Format with Prettier
```

## Cloudflare Integration

- **Adapter**: `@astrojs/cloudflare` with image service compilation
- **Runtime**: Access via `context.locals.runtime` in actions
- **Session**: KV namespace binding for upvote tracking
- **Environment**: Redis credentials via Cloudflare env vars

### Server Actions Pattern

Actions in `src/actions/index.ts` handle server-side logic:

- Use `defineAction` with Zod schemas
- Access Cloudflare runtime via `context.locals.runtime`
- Session management through `context.session`

## Content Conventions

- **File Structure**: Posts can be single files or directories with `index.md`
- **Image Assets**: Co-located with posts or in dedicated asset folders
- **Tags**: Lowercase, used for categorization and routing
- **TOC**: Enable with `toc: true` frontmatter for heading hierarchy

## Utilities and Helpers

- `getAllPosts()`: Filtered, sorted post collection
- `getAllTags()`: Unique tag extraction
- `buildHierarchy()`: TOC generation for h2/h3 headings
- `satoriPNG()`: OG image generation wrapper

## Special Considerations

- **React 19**: Uses edge server rendering to avoid polyfill issues
- **Inlined Styles**: Disabled (`inlineStylesheets: 'never'`) for better caching
- **Chinese Content**: Footnote labels in Chinese ("脚注")
- **Development vs Production**: Redis keys prefixed based on environment
