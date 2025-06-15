import { defineAction } from 'astro:actions';
import { z } from 'astro:schema';
import { Redis } from '@upstash/redis/cloudflare';
import { REDIS_UPVOTE_KEY } from '@/consts';

export const server = {
	getPostUpvotes: defineAction({
		input: z.object({
			postId: z.string(),
		}),
		handler: async ({ postId }, context) => {
			const session = context.session!;
			const redis = Redis.fromEnv(context.locals.runtime.env);

			const [r0, r1] = await Promise.all([
				redis.zscore(REDIS_UPVOTE_KEY, postId),
				session.get('upvotedPosts'),
			]);
			const count = r0 || 0;
			const upvotedPosts = r1 || [];

			return {
				postId,
				count,
				upvoted: upvotedPosts.includes(postId),
				success: true,
			};
		},
	}),

	upvotePost: defineAction({
		input: z.object({
			postId: z.string(),
		}),
		handler: async ({ postId }, context) => {
			const session = context.session!;
			const { ctx, env } = context.locals.runtime;

			const upvotedPosts = (await session.get('upvotedPosts')) || [];
			if (upvotedPosts.includes(postId)) {
				return { postId, success: false };
			}

			// Perform work without blocking returning a response.
			ctx.waitUntil(
				(async () => {
					const redis = Redis.fromEnv(env);
					await redis.zincrby(REDIS_UPVOTE_KEY, 1, postId);
				})()
			);

			upvotedPosts.push(postId);
			session.set('upvotedPosts', upvotedPosts);

			return { postId, success: true };
		},
	}),
};
