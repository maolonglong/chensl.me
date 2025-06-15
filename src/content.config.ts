import { glob } from 'astro/loaders';
import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
	// Load Markdown and MDX files in the `src/content/blog/` directory.
	loader: glob({ base: './src/content/blog', pattern: '**/*.{md,mdx}' }),
	// Type-check frontmatter using a schema
	schema: z.object({
		title: z.string(),
		description: z.string().default(''),
		// Transform string to Date object
		pubDate: z.coerce.date(),
		tags: z.array(z.string()).optional(),
		draft: z.boolean().default(false),
		toc: z.boolean().default(false),
	}),
});

export const collections = { blog };
