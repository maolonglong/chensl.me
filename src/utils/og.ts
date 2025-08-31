import fs from 'fs/promises';
import type { ReactNode } from 'react';
import { chars, icons } from '@iconify-json/twemoji';
import { getIconData, iconToHTML, iconToSVG, replaceIDs } from '@iconify/utils';
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
				return `data:image/svg+xml;base64,` + btoa(loadEmoji(getIconCode(segment)));
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

const emojiCache: Record<string, string> = {};

function loadEmoji(code: string) {
	if (code in emojiCache) {
		return emojiCache[code];
	}

	const iconName = chars[code];
	if (!iconName) {
		throw new Error(`Emoji not found for code: ${code}`);
	}

	const iconData = getIconData(icons, iconName);
	if (!iconData) {
		throw new Error(`Icon data not found for: ${iconName}`);
	}

	const renderData = iconToSVG(iconData, {
		height: 'auto',
	});
	const svgContent = iconToHTML(replaceIDs(renderData.body), renderData.attributes);

	return (emojiCache[code] = svgContent);
}
