import type { APIRoute } from 'astro';
import { getImage } from 'astro:assets';
import rss, { type RSSFeedItem } from '@astrojs/rss';
import MarkdownIt from 'markdown-it';
import { parse as htmlParser } from 'node-html-parser';
import sanitizeHtml from 'sanitize-html';

import { RSS_FEED_LIMIT, SITE_DESCRIPTION, SITE_TITLE } from '@/consts';
import { getAllPosts } from '@/utils';

const markdownParser = new MarkdownIt();
const images = import.meta.glob<{ default: ImageMetadata }>(
	'/src/content/blog/**/*.{jpeg,jpg,png,gif,webp,svg}'
);

export const GET: APIRoute = async (context) => {
	if (!context.site) {
		throw Error('site not set');
	}

	const posts = (await getAllPosts()).slice(0, RSS_FEED_LIMIT);

	const items: RSSFeedItem[] = [];

	for (const post of posts) {
		const body = markdownParser.render(post.body!);
		const html = htmlParser.parse(body);
		const elements = html.querySelectorAll('img');
		for (const elem of elements) {
			const src = elem.getAttribute('src')!;
			if (src.startsWith('./')) {
				const path = src.replace('./', `/src/content/blog/${post.id}/`);
				const origin = (await images[path]()).default;
				const optimized = await getImage({ src: origin });
				elem.setAttribute('src', new URL(optimized.src, context.site).href);
			} else if (!src.startsWith('https://')) {
				throw Error('src unknown');
			}
		}
		items.push({
			...post.data,
			link: `/blog/${post.id}/`,
			content: sanitizeHtml(html.toString(), {
				allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img']),
			}),
		});
	}

	return rss({
		title: SITE_TITLE,
		description: SITE_DESCRIPTION,
		site: context.site,
		items,
	});
};
