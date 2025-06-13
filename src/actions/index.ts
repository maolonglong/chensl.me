import { defineAction } from 'astro:actions';
import { z } from 'astro:schema';

export const server = {
	getPostUpvotes: defineAction({
		input: z.object({
			postId: z.string(),
		}),
		handler: async ({ postId }, context) => {
			const session = context.session!;
			const kv = context.locals.runtime.env.COUNTER;

			const [r0, r1] = await Promise.all([kv.get(postId), session.get('upvotedPosts')]);
			const count = parseInt(r0 || '0');
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
			const kv = context.locals.runtime.env.COUNTER;

			const upvotedPosts = (await session.get('upvotedPosts')) || [];
			if (upvotedPosts.includes(postId)) {
				return { postId, success: false };
			}

			// Perform work without blocking returning a response.
			context.locals.runtime.ctx.waitUntil(
				(async () => {
					let count = parseInt((await kv.get(postId)) || '0');
					count++;
					await kv.put(postId, count.toString());
				})()
			);

			upvotedPosts.push(postId);
			session.set('upvotedPosts', upvotedPosts);

			return { postId, success: true };
		},
	}),
};
