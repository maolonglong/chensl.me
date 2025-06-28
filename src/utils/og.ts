import fs from 'fs/promises';
import type { ReactNode } from 'react';
import satori from 'satori';
import sharp from 'sharp';

const fontData = await fs.readFile('./src/assets/fonts/JetBrainsMapleMono-Regular.ttf');

async function satoriSVG(element: ReactNode) {
	return await satori(element, {
		width: 1200,
		height: 630,
		fonts: [
			{
				name: 'JetBrains Maple Mono',
				data: fontData,
				weight: 400,
				style: 'normal',
			},
		],
		loadAdditionalAsset: async (code: string, segment: string) => {
			if (code === 'emoji') {
				return `data:image/svg+xml;base64,` + btoa(await loadEmoji(getIconCode(segment)));
			}

			return [];
		},
	});
}

export async function satoriPNG(element: ReactNode) {
	return await sharp(Buffer.from(await satoriSVG(element)))
		.png()
		.toBuffer();
}

const U200D = String.fromCharCode(8205);
const UFE0Fg = /\uFE0F/g;

function getIconCode(char: string) {
	return toCodePoint(char.indexOf(U200D) < 0 ? char.replace(UFE0Fg, '') : char);
}

function toCodePoint(unicodeSurrogates: string) {
	const r = [];
	let c = 0,
		p = 0,
		i = 0;

	while (i < unicodeSurrogates.length) {
		c = unicodeSurrogates.charCodeAt(i++);
		if (p) {
			r.push((65536 + ((p - 55296) << 10) + (c - 56320)).toString(16));
			p = 0;
		} else if (55296 <= c && c <= 56319) {
			p = c;
		} else {
			r.push(c.toString(16));
		}
	}
	return r.join('-');
}

const emojiCache: Record<string, Promise<any>> = {};

function loadEmoji(code: string) {
	if (code in emojiCache) {
		return emojiCache[code];
	}

	const url =
		'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/' + code.toLowerCase() + '.svg';
	return (emojiCache[code] = fetch(url).then((r) => r.text()));
}
