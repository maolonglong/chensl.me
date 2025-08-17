import type { GetStaticPaths } from 'astro';

import PostOgImage from '@/components/og/PostOgImage';
import { getAllPosts } from '@/utils';
import { satoriPNG } from '@/utils/og';

const posts = await getAllPosts();

export async function GET({ params }: { params: { slug: string } }) {
	const post = posts.find((post) => post.id === params.slug);
	if (!post) {
		return new Response('Post not found', { status: 404 });
	}

	const element = PostOgImage({ title: post.data.title });
	const png = await satoriPNG(element);
	return new Response(new Uint8Array(png), {
		headers: {
			'Content-Type': 'image/png',
		},
	});
}

export const getStaticPaths: GetStaticPaths = async () => {
	return posts.map((post) => ({
		params: { slug: post.id },
		props: post,
	}));
};
