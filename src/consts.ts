// Place any global data in this file.
// You can import this data from anywhere in your site by using the `import` keyword.

export const SITE_TITLE = '~chensl';
export const SITE_DESCRIPTION = 'This is my personal website.';
export const REDIS_UPVOTE_KEY = import.meta.env.PROD ? 'upvote' : 'upvote-dev';
export const PAGE_SIZE = 22;
export const RSS_FEED_LIMIT = 20;
