import type { MarkdownHeading } from 'astro';
import { getCollection, type CollectionEntry } from 'astro:content';

import type { TocHeading } from '@/types';

type Post = CollectionEntry<'blog'>;

/**
 * Normalize a single tag to lowercase and trim whitespace
 */
export function normalizeTag(tag: string): string {
	return tag.trim().toLowerCase();
}

/**
 * Normalize an array of tags: trim, lowercase, filter empty, remove duplicates, and sort
 */
export function normalizeTags(tags: string[] | undefined): string[] {
	if (!tags) return [];

	return [...new Set(tags.map((tag) => normalizeTag(tag)).filter((tag) => tag.length > 0))].sort();
}

async function getPublishedEntries<T extends 'blog' | 'translations'>(
	collection: T
): Promise<CollectionEntry<T>[]> {
	return (await getCollection(collection))
		.filter((entry) => !entry.data.draft)
		.sort((b, a) => a.data.pubDate.valueOf() - b.data.pubDate.valueOf());
}

export async function getAllPosts() {
	return getPublishedEntries('blog');
}

export async function getAllTranslations() {
	return getPublishedEntries('translations');
}

function extractTags<T extends { data: { tags?: string[] } }>(entries: T[]): string[] {
	const allTags = entries.flatMap((entry) => entry.data.tags || []);
	return normalizeTags(allTags);
}

export async function getAllTags(posts?: Post[]) {
	if (!posts) {
		posts = await getAllPosts();
	}
	return extractTags(posts);
}

/**
 * Generic function to get all tags from any collection entries
 */
export function getTagsFromEntries<T extends { data: { tags?: string[] } }>(
	entries: T[]
): string[] {
	return extractTags(entries);
}

export function buildHierarchy(headings: MarkdownHeading[]) {
	const tocHeadings: TocHeading[] = [];
	let parent: TocHeading | null = null;

	headings.forEach((h) => {
		const heading = { ...h, subheadings: [] };

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
