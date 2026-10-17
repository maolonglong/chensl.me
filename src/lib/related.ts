import type { CollectionEntry } from 'astro:content'
import index from '../data/related-posts.json'

// Related articles at the end of each article, from src/data/related-posts.json, which
// scripts/embed-posts.mjs writes. Each entry lists the nearest other articles by embedding
// similarity, best first.

// Calibrated on 2026-10-17: pairs at or above 0.35 shared a topic (Docker, Zig, memory
// allocation, agents); most pairs below shared only the writing style or the year.
export const relatedMinScore = 0.35
const maxRelated = 3

// JSON imports widen tuples to arrays, so the file's shape is declared here.
type Index = { posts: Record<string, { hash: string; related: [string, number][] }> }
const { posts: entries } = index as unknown as Index

export function relatedPosts(id: string, posts: CollectionEntry<'blog'>[]) {
  const byId = new Map(posts.map((post) => [post.id, post]))
  return (entries[id]?.related ?? [])
    .filter(([other, score]) => other !== id && score >= relatedMinScore && byId.has(other))
    .slice(0, maxRelated)
    .map(([other]) => byId.get(other)!)
}
