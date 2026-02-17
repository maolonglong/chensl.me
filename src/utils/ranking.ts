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

		const scoreMap = new Map<string, number>();
		for (let i = 0; i < scores.length; i += 2) {
			scoreMap.set(scores[i] as string, Number(scores[i + 1]));
		}

		const topK = 5;
		const scoredPosts: { post: CollectionEntry<'blog'>; score: number; originalIndex: number }[] = [];
		for (let i = 0; i < posts.length; i++) {
			const post = posts[i];
			const score = scoreMap.get(post.id);
			if (score !== undefined && score !== 0) {
				scoredPosts.push({ post, score, originalIndex: i });
			}
		}

		scoredPosts.sort((a, b) => {
			if (b.score !== a.score) {
				return b.score - a.score;
			}
			return a.originalIndex - b.originalIndex;
		});

		const result: CollectionEntry<'blog'>[] = [];

		// 1. score > 0
		for (let i = 0; i < scoredPosts.length && result.length < topK; i++) {
			if (scoredPosts[i].score <= 0) break;
			result.push(scoredPosts[i].post);
		}

		// 2. score === 0
		if (result.length < topK) {
			for (let i = 0; i < posts.length && result.length < topK; i++) {
				const post = posts[i];
				const score = scoreMap.get(post.id) ?? 0;
				if (score === 0) {
					result.push(post);
				}
			}
		}

		// 3. score < 0
		if (result.length < topK) {
			for (let i = 0; i < scoredPosts.length && result.length < topK; i++) {
				if (scoredPosts[i].score < 0) {
					result.push(scoredPosts[i].post);
				}
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
