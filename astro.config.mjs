// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import react from '@astrojs/react';
import purgecss from 'astro-purgecss';
import expressiveCode from 'astro-expressive-code';
import icon from 'astro-icon';
import { remarkDescription } from './src/plugins/remark-description';
import rehypeExternalLinks from 'rehype-external-links';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { rehypeHeadingIds } from '@astrojs/markdown-remark';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';

// https://astro.build/config
export default defineConfig({
	site: 'https://chensl.me',
	trailingSlash: 'always',
	adapter: cloudflare({
		imageService: 'compile',
	}),
	integrations: [
		expressiveCode(),
		mdx(),
		sitemap(),
		icon(),
		react(),
		purgecss({
			content: ['./src/**/*.{astro,js,jsx,ts,tsx,vue,svelte}'],
		}),
	],

	markdown: {
		remarkPlugins: [remarkDescription, remarkMath],
		remarkRehype: { footnoteLabel: '脚注' },
		rehypePlugins: [
			[
				rehypeKatex,
				{
					output: 'mathml',
				},
			],
			[rehypeExternalLinks, { rel: ['nofollow'], target: '_blank' }],
			rehypeHeadingIds,
			[
				rehypeAutolinkHeadings,
				{
					behavior: 'append',
					content: {
						type: 'text',
						value: '#',
					},
					headingProperties: {
						className: ['anchor'],
					},
					properties: {
						className: ['anchor-link'],
					},
				},
			],
		],
		syntaxHighlight: {
			excludeLangs: ['mermaid', 'math'],
		},
	},

	build: {
		inlineStylesheets: 'never',
	},

	vite: {
		resolve: {
			// https://github.com/withastro/astro/issues/12824
			//
			// Use react-dom/server.edge instead of react-dom/server.browser for React 19.
			// Without this, MessageChannel from node:worker_threads needs to be polyfilled.
			alias: import.meta.env.PROD
				? {
						'react-dom/server': 'react-dom/server.edge',
					}
				: undefined,
		},
	},
});
