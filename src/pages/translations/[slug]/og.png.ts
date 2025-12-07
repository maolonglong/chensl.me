import PostOgImage from '@/components/og/PostOgImage';
import { getAllTranslations } from '@/utils';
import { createOgImageHandlers } from '@/utils/og';

const handlers = createOgImageHandlers(getAllTranslations, PostOgImage);

export const GET = handlers.GET;
export const getStaticPaths = handlers.getStaticPaths;
