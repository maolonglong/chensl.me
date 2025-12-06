import { readFile } from 'fs/promises';
import type { GetStaticPaths } from 'astro';

import PostOgImage from '@/components/og/PostOgImage';
import { getAllTranslations } from '@/utils';
import { satoriPNG } from '@/utils/og';

const translations = await getAllTranslations();
const logoBuffer = await readFile('./public/android-chrome-192x192.png');
const logo = `data:image/png;base64,${logoBuffer.toString('base64')}`;

export async function GET({ params }: { params: { slug: string } }) {
	const translation = translations.find((translation) => translation.id === params.slug);
	if (!translation) {
		return new Response('Translation not found', { status: 404 });
	}

	const element = PostOgImage({
		title: translation.data.title,
		description: translation.data.description,
		logo,
	});
	const png = await satoriPNG(element);
	return new Response(new Uint8Array(png), {
		headers: {
			'Content-Type': 'image/png',
		},
	});
}

export const getStaticPaths: GetStaticPaths = async () => {
	return translations.map((translation) => ({
		params: { slug: translation.id },
		props: translation,
	}));
};
