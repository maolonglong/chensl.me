import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// Base schema shared by all post types
const basePostSchema = z.object({
	title: z.string(),
	description: z.string(),
	// Transform string to Date object
	pubDate: z.coerce.date(),
	tags: z.array(z.string()).optional(),
	draft: z.boolean().default(false),
	toc: z.boolean().default(false),
});

const blog = defineCollection({
	// Load Markdown and MDX files in the `src/content/blog/` directory.
	loader: glob({ base: './src/content/blog', pattern: '**/*.{md,mdx}' }),
	// Type-check frontmatter using a schema
	schema: basePostSchema,
});

const translations = defineCollection({
	// Load Markdown and MDX files in the `src/content/translations/` directory.
	loader: glob({ base: './src/content/translations', pattern: '**/*.{md,mdx}' }),
	// Type-check frontmatter using a schema
	schema: basePostSchema.extend({
		// Source URL for the original article
		source: z.string().url(),
	}),
});

export const collections = { blog, translations };
