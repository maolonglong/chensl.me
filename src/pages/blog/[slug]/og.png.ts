import PostOgImage from '@/components/og/PostOgImage';
import { getAllPosts } from '@/utils';
import { createOgImageHandlers } from '@/utils/og';

const handlers = createOgImageHandlers(getAllPosts, PostOgImage);

export const GET = handlers.GET;
export const getStaticPaths = handlers.getStaticPaths;
