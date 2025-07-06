# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- Dev server: `pnpm run dev`
- Build: `pnpm run build`
- Preview: `pnpm run preview`
- Format code: `pnpm run format`
- Run Astro commands: `pnpm run astro`

## Code Structure

- Content is stored in `src/content/blog/` with each post as a separate markdown file.
- The site is built using Astro (astro.build).
- Main configuration is in `astro.config.mjs`.
- Posts are rendered using Astro's markdown processing and layout components.
