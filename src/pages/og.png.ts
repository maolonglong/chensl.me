import HomeOgImage from '@/components/og/HomeOgImage';
import { satoriPNG } from '@/utils/og';

export async function GET() {
	const element = HomeOgImage();
	const png = await satoriPNG(element);
	return new Response(new Uint8Array(png), {
		headers: {
			'Content-Type': 'image/png',
		},
	});
}
