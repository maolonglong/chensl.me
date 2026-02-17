import type { CollectionEntry } from 'astro:content';
import { Redis } from '@upstash/redis/cloudflare';

import { POPULAR_POSTS_LIMIT, REDIS_UPVOTE_KEY } from '@/consts';

export async function getPopularPosts(
	env: any,
	posts: CollectionEntry<'blog'>[]
): Promise<CollectionEntry<'blog'>[]> {
	if (!env) {
		return posts.slice(0, POPULAR_POSTS_LIMIT);
	}

	try {
		const redis = Redis.fromEnv(env);

		const scores = await redis.zrange(REDIS_UPVOTE_KEY, 0, POPULAR_POSTS_LIMIT - 1, {
			rev: true,
			withScores: true,
		});

		const scoreMap = new Map<string, number>();
		for (let i = 0; i < scores.length; i += 2) {
			scoreMap.set(scores[i] as string, Number(scores[i + 1]));
		}

		if (scoreMap.size === 0) {
			return posts.slice(0, POPULAR_POSTS_LIMIT);
		}

		const withScore: { post: CollectionEntry<'blog'>; score: number; index: number }[] = [];
		const withoutScore: CollectionEntry<'blog'>[] = [];

		for (let i = 0; i < posts.length; i++) {
			const post = posts[i];
			const score = scoreMap.get(post.id);
			if (score !== undefined && score > 0) {
				withScore.push({ post, score, index: i });
			} else if (withoutScore.length < POPULAR_POSTS_LIMIT) {
				withoutScore.push(post);
			}
		}

		return withScore
			.sort((a, b) => b.score - a.score || a.index - b.index)
			.map((item) => item.post)
			.concat(withoutScore)
			.slice(0, POPULAR_POSTS_LIMIT);
	} catch (error) {
		console.error('Failed to load popular posts from Redis:', {
			error: error instanceof Error ? error.message : String(error),
			stack: error instanceof Error ? error.stack : undefined,
			hasEnv: !!env,
		});
		return posts.slice(0, POPULAR_POSTS_LIMIT);
	}
}
