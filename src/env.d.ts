type Runtime = import('@astrojs/cloudflare').Runtime<Env>;

declare namespace App {
	interface SessionData {
		upvotedPosts: string[];
	}

	type Locals = Runtime;
}
