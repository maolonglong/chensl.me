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

## AI Code Generation Marking Guidelines

When generating or modifying code, always mark AI-generated changes to maintain code traceability and enable easier maintenance.

### Basic Usage

#### Single Line Changes

For single line changes, add the comment at the end of the line:

```typescript
const newFeature = true; // ai_generated
```

#### Multi-line Changes

For multiple consecutive lines, wrap them with start/end comments:

```typescript
// ai_generated start
const handleUpvote = async () => {
  await upvotePost(postId);
  setUpvoteCount((prev) => prev + 1);
};
// ai_generated end
```

### Language-Specific Examples

#### HTML/JSX/TSX (Astro components)

Always use multi-line comment format for these file types:

```astro
{/* ai_generated start */}
<button onclick={handleClick}>Click me</button>
{/* ai_generated end */}
```

#### CSS

```css
/* ai_generated */
.ai-enhanced-style {
  display: flex;
  align-items: center;
}

/* ai_generated start */
.complex-layout {
  grid-template-areas: "header content";
  gap: 1rem;
}
/* ai_generated end */}
```

#### Markdown Content

For blog posts and documentation:

```markdown
<!-- ai_generated start -->

## New Section Title

This content was generated to enhance the article structure.

<!-- ai_generated end -->
```

### Special Cases

#### New Files

If creating a completely new file, add this comment at the top:

```javascript
// ai_generated - new file
```

#### AI-Specific Components/Features

If the entire component or feature is AI-generated, no individual line marking is required, just mark the file as new.

#### Configuration Files

```json
{
  "newConfig": "value", // ai_generated
  "existingConfig": "unchanged"
}
```

## Special Considerations

- **React 19**: Uses edge server rendering to avoid polyfill issues
- **Inlined Styles**: Disabled (`inlineStylesheets: 'never'`) for better caching
- **Chinese Content**: Footnote labels in Chinese ("脚注")
- **Development vs Production**: Redis keys prefixed based on environment
