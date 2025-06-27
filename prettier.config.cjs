/** @type {import('prettier').Config} */
module.exports = {
	printWidth: 100,
	semi: true,
	singleQuote: true,
	tabWidth: 2,
	trailingComma: 'es5',
	useTabs: true,
	importOrder: [
		'^(react/(.*)$)|^(react$)',
		'^(astro/(.*)$)|^(astro:(.*)$)|^(astro$)',
		'^@astrojs/(.*)$',
		'^astro-(.*)$',
		'<THIRD_PARTY_MODULES>',
		'',
		'^@/types$',
		'^@/consts$',
		'^@/(.*)$',
		'',
		'^[./]',
	],
	importOrderParserPlugins: ['typescript', 'jsx', 'decorators-legacy'],
	plugins: ['prettier-plugin-astro', '@ianvs/prettier-plugin-sort-imports'],
	overrides: [
		{
			files: ['.*', '*.json', '*.jsonc', '*.md', '*.mdx', '*.toml', '*.yml', '*.yaml'],
			options: {
				useTabs: false,
			},
		},
		{
			files: ['*.md', '*.mdx'],
			options: {
				printWidth: 80,
			},
		},
		{
			files: ['*.astro'],
			options: {
				parser: 'astro',
			},
		},
	],
};
