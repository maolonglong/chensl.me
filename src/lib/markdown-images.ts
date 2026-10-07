import type { APIContext, GetStaticPathsOptions } from 'astro'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { postUrl, publishedPosts } from './posts'

export const prerender = true

export async function getStaticPaths({ routePattern }: GetStaticPathsOptions) {
  const extension = path.extname(routePattern)
  const images = new Map<string, string>()
  for (const post of await publishedPosts()) {
    // Reuse Astro's collected image paths, including reference-style images. Publishing the
    // originals alongside the export keeps post.body verbatim; HTML/RSS still use optimized images.
    for (const image of post.rendered?.metadata?.imagePaths ?? []) {
      if (URL.canParse(image) || image.startsWith('/')) continue
      const url = new URL(image, `https://site.invalid${postUrl(post)}`)
      if (!url.pathname.startsWith('/blog/')) {
        throw new Error(`Markdown image escapes /blog/: ${post.id}: ${image}`)
      }
      const target = decodeURIComponent(url.pathname.slice('/blog/'.length))
      if (path.posix.extname(target) !== extension) continue
      const source = path.resolve(path.dirname(post.filePath!), image)
      if (images.has(target) && images.get(target) !== source) {
        throw new Error(`Conflicting Markdown images at /blog/${target}`)
      }
      images.set(target, source)
    }
  }
  return [...images].map(([target, source]) => ({
    params: { image: target.slice(0, -extension.length) },
    props: { source, extension },
  }))
}

export async function GET({ props }: APIContext) {
  const subtype =
    ({ '.svg': 'svg+xml', '.jpg': 'jpeg' } as Record<string, string>)[props.extension] ??
    props.extension.slice(1)
  return new Response(new Uint8Array(await readFile(props.source)), {
    headers: { 'Content-Type': `image/${subtype}` },
  })
}
