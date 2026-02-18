import type { CollectionEntry } from 'astro:content';
import { Redis } from '@upstash/redis/cloudflare';

import { REDIS_UPVOTE_KEY } from '@/consts';

export async function getPopularPosts(
	env: any,
	posts: CollectionEntry<'blog'>[]
): Promise<CollectionEntry<'blog'>[]> {
	if (!env) {
		return posts.slice(0, 5);
	}

	try {
		const redis = Redis.fromEnv(env);

		const scores = await redis.zrange(REDIS_UPVOTE_KEY, 0, 4, {
			rev: true,
			withScores: true,
		});

		const topIds: string[] = [];
		for (let i = 0; i < scores.length; i += 2) {
			topIds.push(scores[i] as string);
		}

		const postMap = new Map(posts.map((post) => [post.id, post]));
		const result: CollectionEntry<'blog'>[] = [];
		const used = new Set<string>();

		for (const id of topIds) {
			const post = postMap.get(id);
			if (post) {
				result.push(post);
				used.add(id);
			}
		}

		for (const post of posts) {
			if (result.length >= 5) break;
			if (!used.has(post.id)) {
				result.push(post);
			}
		}

		return result;
	} catch (error) {
		console.error('Failed to load popular posts from Redis:', {
			error: error instanceof Error ? error.message : String(error),
			stack: error instanceof Error ? error.stack : undefined,
			hasEnv: !!env,
		});
		return posts.slice(0, 5);
	}
}
