// The Actions accept these IDs and every built article page must match, so an upvote lookup
// stays a path segment. src/actions/index.ts and scripts/check-site.mjs both read this.
export const postIdPattern = /^[a-z0-9_-]+$/

export const isPostId = (value) => postIdPattern.test(value)
