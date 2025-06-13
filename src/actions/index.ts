import { defineAction } from 'astro:actions';
import { z } from 'astro:schema';

export const server = {
	getPostUpvotes: defineAction({
		input: z.object({
			postId: z.string(),
		}),
		handler: async ({ postId }, context) => {
			const kv = context.locals.runtime.env.COUNTER;
			const count = (await kv.get(postId)) || '0';

			const upvotedPosts = (await context.session?.get('upvotedPosts')) || [];

			return {
				postId,
				count: parseInt(count, 10),
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
			const kv = context.locals.runtime.env.COUNTER;
			let count = parseInt((await kv.get(postId)) || '0', 10);

			const upvotedPosts = (await context.session?.get('upvotedPosts')) || [];
			if (upvotedPosts.includes(postId)) {
				return {
					postId,
					count,
					success: false,
				};
			}

			count++;
			await kv.put(postId, count.toString());

			upvotedPosts.push(postId);
			context.session?.set('upvotedPosts', upvotedPosts);

			return {
				postId,
				count,
				success: true,
			};
		},
	}),
};
