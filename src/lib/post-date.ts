import * as nodeFS from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// A clock time with no offset. A date-only value is not included: UTC midnight is already the
// same Shanghai calendar day on every build machine.
const unzonedTime = /^(\d{4}-\d{2}-\d{2})[Tt ](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)$/

export function parsePostDate(value: string): Date {
  const time = value.trim().match(unzonedTime)
  if (time) return new Date(`${time[1]}T${time[2]}+08:00`)
  return new Date(value)
}

const frontMatterTime = new RegExp(
  `^(pubDate|updatedDate):[ \\t]*(${unzonedTime.source.slice(1, -1)})[ \\t]*$`,
  'gm',
)

export function rewriteUnzonedFrontMatter(source: string): string {
  return source.replace(/^---\r?\n[\s\S]*?\r?\n---/, (block) =>
    block.replace(frontMatterTime, '$1: $2+08:00'),
  )
}

function blogMarkdownPath(target: unknown): boolean {
  const file =
    target instanceof URL ? fileURLToPath(target) : typeof target === 'string' ? target : undefined
  if (!file?.endsWith('.md')) return false
  const parts = file.split(path.sep)
  const src = parts.lastIndexOf('src')
  return parts[src + 1] === 'content' && parts[src + 2] === 'blog'
}

// Astro parses front matter with its own js-yaml, which has already turned an unzoned time into
// a UTC Date by the time the schema runs. The offset is still in the file at this read.
export async function loadWithShanghaiFrontMatter<T>(load: () => Promise<T>): Promise<T> {
  const original = nodeFS.promises.readFile
  // The wrapper returns a string for blog Markdown and the original result otherwise.
  nodeFS.promises.readFile = (async (
    target: Parameters<typeof original>[0],
    options?: Parameters<typeof original>[1],
  ) => {
    const contents =
      options === undefined ? await original(target) : await original(target, options)
    if (typeof contents !== 'string' || !blogMarkdownPath(target)) return contents
    return rewriteUnzonedFrontMatter(contents)
  }) as typeof original
  try {
    return await load()
  } finally {
    nodeFS.promises.readFile = original
  }
}
