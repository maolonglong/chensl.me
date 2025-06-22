import { useEffect, useState } from 'react';
import { actions } from 'astro:actions';
import { clsx } from 'clsx';

export default function Upvote({ postId }: { postId: string }) {
	const [count, setCount] = useState(0);
	const [upvoted, setUpvoted] = useState(false);

	useEffect(() => {
		(async () => {
			const { data, error } = await actions.getPostUpvotes({ postId });
			// TODO: error handle
			if (!error && data.success) {
				setCount(data.count);
				setUpvoted(data.upvoted);
			}
		})();
	}, [postId]);

	const handleClick = async () => {
		if (upvoted) {
			return;
		}
		setUpvoted(true);
		setCount(count + 1);
		await actions.upvotePost({ postId });
	};

	return (
		<div style={{ display: 'inline' }}>
			<button
				className={clsx('upvote-button', { upvoted })}
				title="Toast this post"
				onClick={handleClick}
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 24 24"
					width="24"
					height="24"
					stroke="currentColor"
					strokeWidth="2"
					fill="none"
					strokeLinecap="round"
					strokeLinejoin="round"
				>
					<polyline points="17 11 12 6 7 11"></polyline>
					<polyline points="17 18 12 13 7 18"></polyline>
				</svg>
				<small className="upvote-count">{count}</small>
			</button>
		</div>
	);
}
