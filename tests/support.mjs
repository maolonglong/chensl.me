import assert from 'node:assert/strict'
import { cp, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { after } from 'node:test'

// Fixtures shared by the scripts/*.test.mjs suites. They copy the Astro project surface into a
// temporary directory and exercise behavior through the real Astro CLI; source structure is
// deliberately not asserted. Each test file runs in its own process, so it builds and cleans up
// its own directories.

export const root = path.resolve(import.meta.dirname, '..')
const temporaryDirectories = []

after(async () =>
  Promise.all(
    temporaryDirectories.map((directory) => rm(directory, { recursive: true, force: true })),
  ),
)

export async function temporaryDirectory(prefix) {
  const directory = await mkdtemp(path.join(os.tmpdir(), prefix))
  temporaryDirectories.push(directory)
  return directory
}

export async function write(directory, relative, content) {
  const file = path.join(directory, relative)
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, content)
}

export function run(command, args, cwd) {
  return spawnSync(command, args, { cwd, encoding: 'utf8', env: { ...process.env, TZ: 'UTC' } })
}

export async function astroProject(prefix) {
  const fixture = await temporaryDirectory(prefix)
  for (const relative of ['astro.config.mjs', 'wrangler.jsonc', 'src', 'public', 'vendor/fonts']) {
    try {
      await cp(path.join(root, relative), path.join(fixture, relative), { recursive: true })
    } catch (error) {
      if (error.code === 'ENOENT')
        throw new Error(`Astro migration must provide ${relative} before fixture verification`)
      throw error
    }
  }
  await cp(path.join(root, 'package.json'), path.join(fixture, 'package.json'))
  await rm(path.join(fixture, 'src/content/blog'), { recursive: true, force: true })
  // Link the installed packages but not the build caches, which Vite and Astro write during a
  // build: a shared cache makes builds from parallel test files race on it.
  await mkdir(path.join(fixture, 'node_modules'))
  for (const entry of await readdir(path.join(root, 'node_modules'))) {
    if (entry === '.vite' || entry === '.astro') continue
    await symlink(path.join(root, 'node_modules', entry), path.join(fixture, 'node_modules', entry))
  }
  return fixture
}

export async function buildAstro(fixture) {
  const result = run(path.join(root, 'node_modules/.bin/astro'), ['build'], fixture)
  assert.equal(result.status, 0, result.stderr || result.stdout)
  return path.join(fixture, 'dist/client')
}

export const frontmatter = (title, date, extra = '') =>
  `---\ntitle: ${JSON.stringify(title)}\npubDate: ${date}\n${extra}---\n`

let behaviorBuild
export async function behaviorFixture() {
  if (!behaviorBuild)
    behaviorBuild = (async () => {
      const fixture = await astroProject('astro-behavior-')
      const png = await readFile(path.join(root, 'public/favicon-16x16.png'))
      await write(fixture, 'public/root.png', png)
      await write(fixture, 'src/content/blog/render/pixel.png', png)
      await write(fixture, 'src/content/blog/render/café.png', png)
      await write(
        fixture,
        'src/content/blog/render/shape.svg',
        '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 10 10"/>',
      )
      await write(
        fixture,
        'src/content/blog/render/index.md',
        `${frontmatter('Escaped <title> & "quote"', '2025-01-02T00:30:00+08:00')}
![bundle](pixel.png)
![encoded](café.png)
![svg](shape.svg)
![root](/root.png?v=2#root)
![remote](HTTPS://cdn.example.test/upper.png)
![protocol](https://cdn.example.test/protocol.png)
![data](DATA:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==)

[query](../below/?x=1&y=two%20words#section)
<a href="?x=3&#x26;y=4#hex">Hex entity</a>
<a href="?x=5&#38;y=6#decimal">Decimal entity</a>
<a href="?x=7&amp;y=8#named">Named entity</a>
<a href="?q=&quot;quoted&quot;&amp;y=9">Quoted value</a>
<a href="#first--special">Heading</a>
<a href="https://example.test/?x=1&amp;y=2#external">External</a>
<a href="mailto:author@example.test">Email</a>
<img src="/root.png?x=1&#38;y=2#crop" alt="query-image" width="16" height="16" loading="lazy" decoding="async">

## First & special
### Second
#### Excluded
## Third

麤

First reference[^shared], another note[^other], and the same note again[^shared].

[^shared]: Shared footnote.
[^other]: Other footnote.

| Driver | Actual development |
|:--|:--:|
| Redis | [Miniredis](https://github.com/alicebob/miniredis) |

\`\`\`go title="db/user.go"
package db
\`\`\`

\`\`\`sh
echo plain
\`\`\`

> [!TIP]
> **Bold** lead

> [!NOTE]
> Plain text
`,
      )
      await write(
        fixture,
        'src/content/blog/below.md',
        `${frontmatter('Below', '2025-01-01')}## First\n\n### Second\n\n#### Excluded\n`,
      )
      await write(
        fixture,
        'src/content/blog/older.md',
        `${frontmatter('Older', '2024-01-01')}Published.`,
      )
      await write(
        fixture,
        'src/content/blog/draft.md',
        `${frontmatter('Secret draft', '2026-01-01', 'draft: true\n')}Hidden.`,
      )
      await write(
        fixture,
        'src/content/blog/future.md',
        `${frontmatter('Future post', '2999-01-01')}Hidden.`,
      )
      await write(fixture, 'src/pages/about.astro', '<h1>Independent page</h1>')
      const dist = await buildAstro(fixture)
      return { fixture, dist }
    })()
  return behaviorBuild
}
