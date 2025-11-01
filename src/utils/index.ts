import type { MarkdownHeading } from 'astro';
import { getCollection, type CollectionEntry } from 'astro:content';

import type { TocHeading } from '@/types';

type Post = CollectionEntry<'blog'>;

export async function getAllPosts() {
	return (await getCollection('blog'))
		.filter((post) => !post.data.draft)
		.sort((b, a) => a.data.pubDate.valueOf() - b.data.pubDate.valueOf());
}

export async function getAllTags(posts?: Post[]) {
	if (!posts) {
		posts = await getAllPosts();
	}

	return [
		...new Set(
			posts
				.flatMap((post) => post.data.tags || [])
				.filter((tag) => tag)
				.map((tag) => tag.toLowerCase())
		),
	].sort();
}

export function buildHierarchy(headings: MarkdownHeading[]) {
	const tocHeadings: TocHeading[] = [];
	let parent: TocHeading | null = null;

	headings.forEach((h) => {
		// Remove trailing anchor symbol injected by rehypeAutolinkHeadings
		const sanitizedText = h.text.replace(/\s*#$/, '');
		const heading = { ...h, text: sanitizedText, subheadings: [] };

		if (heading.depth === 2) {
			tocHeadings.push(heading);
			parent = heading;
		} else if (heading.depth === 3) {
			// If h3 has no parent h2, promote it to top level to avoid losing content
			if (parent) {
				parent.subheadings.push(heading);
			} else {
				tocHeadings.push(heading);
			}
		}
		// Silently ignore other heading depths (h1, h4+) as they're not part of the TOC structure
	});

	return tocHeadings;
}
