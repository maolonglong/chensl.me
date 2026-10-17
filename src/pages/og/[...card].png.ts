import type { APIContext } from 'astro'
import { renderCard } from '../../lib/og-card.mjs'
import { articleCard, fixedCards } from '../../lib/og.mjs'
import { creationLabels, displayDate, publishedPosts } from '../../lib/posts'

export const prerender = true

export async function getStaticPaths() {
  const articles = (await publishedPosts()).map((post) => ({
    params: { card: articleCard(post.id) },
    props: {
      title: post.data.title,
      label: [
        displayDate(post.data.pubDate),
        post.data.creation && creationLabels[post.data.creation.mode],
      ]
        .filter(Boolean)
        .join(' · '),
    },
  }))
  const fixed = Object.entries(fixedCards).map(([card, props]) => ({ params: { card }, props }))
  return [...fixed, ...articles]
}

export async function GET({ props }: APIContext<{ title: string; label: string }>) {
  return new Response(new Uint8Array(await renderCard(props)), {
    headers: { 'Content-Type': 'image/png' },
  })
}
