import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { astroProject, buildAstro, frontmatter, root, write } from './support.mjs'

const expectedDate = '2024-06-15T15:00:00.000Z'
const expectedUpdate = '2024-06-16T15:00:00.000Z'
const article = (body) =>
  `${frontmatter('Local time', '2024-06-15T23:00:00', 'updatedDate: 2024-06-16T23:00:00\n')}\n${body}\n`

function assertDates(html) {
  const time = html.match(/<time\b[^>]*datetime="([^"]+)"[^>]*>([^<]+)<\/time>/)
  assert.ok(time, 'Missing publication date')
  assert.deepEqual(time.slice(1), [expectedDate, '2024-06-15'])
  assert.equal(html.match(/data-stale-since="([^"]+)"/)?.[1], expectedUpdate)
}

test('YAML comments preserve Shanghai dates in pages, RSS and Markdown exports', async () => {
  const fixture = await astroProject('astro-commented-dates-')
  await write(
    fixture,
    'src/content/blog/commented.md',
    `${frontmatter('Commented dates', '2024-06-15T23:00:00 # publication', 'updatedDate: 2024-06-16T23:00:00 # modification\n')}\nOriginal body.\n`,
  )
  const dist = await buildAstro(fixture)
  assertDates(await readFile(path.join(dist, 'blog/commented/index.html'), 'utf8'))
  assert.match(
    await readFile(path.join(dist, 'index.xml'), 'utf8'),
    /<pubDate>Sat, 15 Jun 2024 15:00:00 GMT<\/pubDate>/,
  )
  const markdown = await readFile(path.join(dist, 'blog/commented/index.md'), 'utf8')
  assert.match(markdown, /Published: 2024-06-15\nUpdated: 2024-06-16\n/)
  assert.ok(markdown.endsWith('Original body.'))
})

test(
  'Shanghai dates survive dev body edits and newly added articles',
  { timeout: 60_000 },
  async () => {
    const fixture = await astroProject('astro-dev-dates-')
    await write(fixture, 'src/content/blog/local.md', article('Initial body.'))
    const evidence = path.join(root, 'test-results/post-dates')
    await mkdir(evidence, { recursive: true })
    let output = `Fixture: ${fixture}\n`
    const child = spawn(
      path.join(root, 'node_modules/.bin/astro'),
      ['dev', '--host', '127.0.0.1', '--port', '0'],
      { cwd: fixture, env: { ...process.env, TZ: 'UTC', ASTRO_DEV_BACKGROUND: '0' } },
    )
    const exited = once(child, 'exit')
    child.stdout.on('data', (chunk) => (output += chunk))
    child.stderr.on('data', (chunk) => (output += chunk))
    const pause = () => new Promise((resolve) => setTimeout(resolve, 100))
    try {
      let origin
      for (let attempt = 0; attempt < 300; attempt++) {
        origin = output.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0]
        if (origin) break
        assert.equal(child.exitCode, null, output)
        await pause()
      }
      assert.ok(origin, output)
      async function readPage(id, body, name) {
        for (let attempt = 0; attempt < 100; attempt++) {
          const response = await fetch(`${origin}/blog/${id}/`)
          const html = await response.text()
          if (response.status === 200 && html.includes(body)) {
            await writeFile(path.join(evidence, `${name}.html`), html)
            return html
          }
          await pause()
        }
        assert.fail(`Article ${id} did not reload ${body}\n${output}`)
      }
      assertDates(await readPage('local', 'Initial body.', 'initial'))
      await write(fixture, 'src/content/blog/local.md', article('Edited body.'))
      assertDates(await readPage('local', 'Edited body.', 'edited'))
      await write(fixture, 'src/content/blog/added.md', article('Added body.'))
      assertDates(await readPage('added', 'Added body.', 'added'))
    } finally {
      child.kill('SIGTERM')
      await exited
      await writeFile(path.join(evidence, 'dev.log'), output)
    }
  },
)
