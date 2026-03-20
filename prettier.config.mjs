/** @type {import('prettier').Config} */
export default {
	semi: false,
	singleQuote: true,
	trailingComma: 'all',
	plugins: ['@prettier/plugin-oxc', 'prettier-plugin-astro'],
	overrides: [
		{
			files: [
				'**/node_modules/**',
				'**/dist/**',
				'**/coverage/**',
				'**/temp/**',
				'**/.vitepress/cache/**',
				'**/.nuxt/**',
				'**/.vercel/**',
				'**/.changeset/**',
				'**/.idea/**',
				'**/.output/**',
				'**/.vite-inspect/**',
				'output/**',
				'**/CHANGELOG*.md',
				'**/*.min.*',
				'**/LICENSE*',
				'**/__snapshots__',
				'**/auto-import?(s).d.ts',
				'**/components.d.ts',
				'**/typed-router.d.ts',
				'**/pnpm-lock.yaml',
			],
			options: {
				requirePragma: true,
			},
		},
		{
			files: '*.astro',
			options: {
				parser: 'astro',
			},
		},
	],
}
