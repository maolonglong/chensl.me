# Project Overview

This is a personal blog built with [Astro](https://astro.build/). The content is written in Markdown and the site is deployed on Cloudflare. It uses React for interactive components like the upvote button.

## Main Technologies

*   **Framework:** [Astro](https://astro.build/)
*   **UI Components:** [React](https://react.dev/)
*   **Styling:** [PurgeCSS](https://purgecss.com/)
*   **Code Highlighting:** [Expressive Code](https://expressive-code.com/)
*   **Database:** [Upstash Redis](https://upstash.com/redis) for upvote counts
*   **Deployment:** [Cloudflare Pages](https://pages.cloudflare.com/)

# Building and Running

*   **Development:** `pnpm dev` - Starts the development server.
*   **Build:** `pnpm build` - Builds the site for production.
*   **Preview:** `pnpm preview` - Builds the site and previews it locally using Wrangler.

# Development Conventions

*   **Content:** Blog posts are located in `src/content/blog` and are written in Markdown.
*   **Components:** Astro components are in `src/components`, and React components are in `src/components` with a `.tsx` extension.
*   **Layouts:** The main layouts for pages and blog posts are in `src/layouts`.
*   **Static Assets:** Static assets like images and fonts are in the `public` directory.
*   **Actions:** Server-side actions are defined in `src/actions/index.ts` and are used for features like upvoting.
