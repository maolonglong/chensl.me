// Refreshes src/data/github-repos.json, the build snapshot of each repository that an article
// links as a card. Run it by hand after adding or changing such a link, and commit the file:
//   node scripts/github-repos.mjs
// Builds and CI read only the committed file, so they never depend on the GitHub API. The Worker
// serves only the repositories in the file (src/lib/github-endpoint.ts). Set GITHUB_TOKEN to raise
// the API rate limit. A repository that the API does not return is left out, and its link stays
// a plain link.
import { readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createMarkdownProcessor, parseFrontmatter } from '@astrojs/markdown-remark'
import { standaloneRepositoryLinks } from '../src/lib/markdown.mjs'
import { repoFields } from '../src/lib/github-repo.mjs'

const root = path.resolve(import.meta.dirname, '..')
const blog = path.join(root, 'src/content/blog')
const output = path.join(root, 'src/data/github-repos.json')

const keys = new Set()
const collect = () => (tree) => {
  for (const { key } of standaloneRepositoryLinks(tree)) keys.add(key)
}
const markdown = await createMarkdownProcessor({ remarkPlugins: [collect], syntaxHighlight: false })
for (const file of (await readdir(blog, { recursive: true })).filter((name) =>
  name.endsWith('.md'),
))
  await markdown.render(parseFrontmatter(await readFile(path.join(blog, file), 'utf8')).content)

const headers = {
  accept: 'application/vnd.github+json',
  'user-agent': 'chensl.me',
  'x-github-api-version': '2022-11-28',
}
if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`
const repos = {}
for (const key of [...keys].sort()) {
  const response = await fetch(`https://api.github.com/repos/${key}`, { headers })
  if (response.status === 404) {
    console.warn(`${key}: not found; the link stays plain`)
    continue
  }
  if (!response.ok) throw new Error(`${key}: GitHub API answered ${response.status}`)
  const fields = repoFields(await response.json())
  if (!fields) throw new Error(`${key}: GitHub API answered without repository fields`)
  repos[key] = fields
}
await writeFile(output, `${JSON.stringify(repos, null, 2)}\n`)
console.log(`Wrote ${Object.keys(repos).length} repositories to src/data/github-repos.json`)
