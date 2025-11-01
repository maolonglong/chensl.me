// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import { rehypeHeadingIds } from '@astrojs/markdown-remark';
import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import expressiveCode from 'astro-expressive-code';
import icon from 'astro-icon';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import rehypeExternalLinks from 'rehype-external-links';
import rehypeKatex from 'rehype-katex';
import remarkMath from 'remark-math';

// https://astro.build/config
export default defineConfig({
	site: 'https://chensl.me',
	trailingSlash: 'always',
	adapter: cloudflare({
		imageService: 'compile',
	}),
	integrations: [expressiveCode(), mdx(), sitemap(), icon(), react()],

	markdown: {
		remarkPlugins: [remarkMath],
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

	vite: {
		ssr: {
			external: ['fs/promises'],
		},
	},
});
