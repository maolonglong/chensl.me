import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { behaviorFixture } from './support.mjs'

// Document contracts: the CSP precedes scripts and hashes them, and metadata escapes hostile titles.

test('CSP precedes executable scripts and hashes their emitted bytes', async () => {
  const { dist } = await behaviorFixture()
  for (const page of ['index.html', 'blog/render/index.html', '404.html']) {
    const html = await readFile(path.join(dist, page), 'utf8')
    const policy = html.match(/<meta http-equiv="content-security-policy" content="([^"]+)"/)
    assert.ok(policy, `${page}: missing CSP`)
    const scripts = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)].filter(
      ([, attributes]) => !attributes.includes('application/ld+json'),
    )
    assert.ok(scripts.length, `${page}: missing scripts`)
    for (const script of scripts) {
      assert.ok(policy.index < script.index, `${page}: executable script precedes CSP`)
      if (script[1].includes('src=')) continue
      const hash = createHash('sha256').update(script[2]).digest('base64')
      assert.ok(policy[1].includes(`'sha256-${hash}'`), `${page}: untrusted inline script`)
    }
  }
})

test('SEO metadata and visible text escape hostile titles', async () => {
  const { dist } = await behaviorFixture()
  const html = await readFile(path.join(dist, 'blog/render/index.html'), 'utf8')
  assert.match(html, /<title>[^<]*Escaped &lt;title&gt; &amp; (?:&quot;|&#34;)quote/)
  assert.match(html, /rel="canonical" href="https:\/\/chensl\.me\/blog\/render\/"/)
  // HTML permits literal angle brackets inside quoted attributes. Assert the parsed value,
  // not a particular serializer's choice to encode those brackets.
  const parsed = spawnSync(
    'python3',
    [
      '-c',
      `
from html.parser import HTMLParser
import sys
class Parser(HTMLParser):
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'meta' and attrs.get('property') == 'og:title':
            print(attrs['content'])
Parser().feed(sys.stdin.read())
`,
    ],
    { input: html, encoding: 'utf8' },
  )
  assert.equal(parsed.status, 0, parsed.stderr)
  assert.equal(parsed.stdout.trim(), 'Escaped <title> & "quote"')
  assert.doesNotMatch(html, /<title>[^<]*<title>/)
})
