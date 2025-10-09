// @ts-check
import { defineEcConfig } from 'astro-expressive-code';
import { transformerColorizedBrackets } from '@shikijs/colorized-brackets';

export default defineEcConfig({
	themes: ['github-dark-dimmed', 'github-light-default'],
	styleOverrides: {
		borderRadius: '0.2rem',
		frames: {
			editorActiveTabIndicatorHeight: '2px',
			frameBoxShadowCssValue: 'none',
		},
		uiFontFamily:
			"'PingFang SC', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji'",
		codeFontFamily:
			"'JetBrains Maple Mono', 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
	},
	shiki: {
		transformers: [transformerColorizedBrackets()],
	},
});
