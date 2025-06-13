import { type CollectionEntry, getCollection } from 'astro:content';

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
