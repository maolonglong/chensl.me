import rss from '@astrojs/rss';
import { SITE_TITLE, SITE_DESCRIPTION } from '@/consts';
import sanitizeHtml from 'sanitize-html';
import MarkdownIt from 'markdown-it';
import { getAllPosts } from '@/utils';
const parser = new MarkdownIt();

export async function GET(context) {
	const posts = await getAllPosts();
	return rss({
		title: SITE_TITLE,
		description: SITE_DESCRIPTION,
		site: context.site,
		items: posts.map((post) => ({
			...post.data,
			link: `/blog/${post.id}/`,
			content: sanitizeHtml(parser.render(post.body)),
		})),
	});
}
