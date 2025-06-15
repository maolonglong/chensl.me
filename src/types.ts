import type { MarkdownHeading } from 'astro';

export type TocHeading = MarkdownHeading & {
	subheadings: TocHeading[];
};
