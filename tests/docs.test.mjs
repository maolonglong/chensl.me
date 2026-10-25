import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, readlinkSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'

// Structural checks for first-party Markdown: the rules in docs/AGENTS.md that a script can
// decide. Each failure names the file, the problem, and the fix.

const root = path.resolve(import.meta.dirname, '..')
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'pipe' })
const tracked = git('ls-files', '--cached', '--others', '--exclude-standard')
  .split('\n')
  .filter((file) => file && existsSync(path.join(root, file)))
const topLevel = new Set(tracked.map((file) => file.split('/')[0]))

// Third-party skills come from `npx skills`; their links are upstream's concern.
const installedSkills = Object.keys(
  JSON.parse(readFileSync(path.join(root, 'skills-lock.json'), 'utf8')).skills,
)
// archived/ holds retired blog posts, which keep the author's words as they were.
const isFirstParty = (file) =>
  !file.startsWith('src/content/') &&
  !file.startsWith('archived/') &&
  !installedSkills.some((name) => file.startsWith(`.agents/skills/${name}/`))
const documents = tracked.filter((file) => file.endsWith('.md') && isFirstParty(file))

// Prose without fenced code blocks, with one entry per source line so errors carry line numbers.
function proseLines(file) {
  let fence = null
  return readFileSync(path.join(root, file), 'utf8')
    .split('\n')
    .map((line) => {
      const marker = line.match(/^\s*(```|~~~)/)?.[1]
      if (marker && (!fence || marker === fence)) {
        fence = fence ? null : marker
        return ''
      }
      return fence ? '' : line
    })
}

// GitHub's heading anchors: lowercase, drop punctuation, spaces to hyphens, number duplicates.
function anchors(file) {
  const seen = new Map()
  const result = new Set()
  for (const line of proseLines(file)) {
    const heading = line.match(/^#{1,6}\s+(.+?)\s*#*\s*$/)?.[1]
    if (!heading) continue
    const text = heading.replace(/`([^`]*)`/g, '$1').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    const slug = text
      .toLowerCase()
      .replace(/[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu, '')
      .replace(/ /g, '-')
    const count = seen.get(slug) ?? 0
    seen.set(slug, count + 1)
    result.add(count ? `${slug}-${count}` : slug)
  }
  return result
}

const fileName =
  /^[\w@-][\w.@-]*\.(?:astro|c?js|mjs|ts|css|md|jsonc?|ya?ml|toml|py|sh|txt|xml|html)$/

function eachSpan(file, visit) {
  proseLines(file).forEach((line, index) => {
    const where = `${file}:${index + 1}`
    const prose = line.replace(/`[^`]*`/g, '')
    for (const [, angled, bare] of prose.matchAll(
      /\[[^\]]*\]\((?:<([^>]+)>|([^)\s]+))(?:\s+"[^"]*")?\)/g,
    )) {
      visit({ kind: 'link', value: angled ?? bare, where })
    }
    // A reference-style link definition: `[label]: target`.
    const definition = prose.match(/^\s*\[[^\]]+\]:\s*(\S+)/)?.[1]
    if (definition) visit({ kind: 'link', value: definition, where })
    for (const [, code] of line.matchAll(/`([^`]+)`/g)) visit({ kind: 'code', value: code, where })
  })
}

// Cited commits must be in the history of main (docs/AGENTS.md). A pull-request checkout has
// only origin/main. A dangling local object would pass `cat-file`, so test ancestry.
const mainRef = ['main', 'origin/main', 'HEAD'].find((ref) => {
  try {
    git('rev-parse', '--verify', '--quiet', `${ref}^{commit}`)
    return true
  } catch {
    return false
  }
})
function isAncestor(commit) {
  try {
    git('merge-base', '--is-ancestor', commit, mainRef)
    return true
  } catch {
    return false
  }
}

test('the checks see the standing documents', () => {
  // An empty corpus would let every other check pass without reading anything.
  for (const file of ['AGENTS.md', 'docs/AGENTS.md', '.agents/notes/AGENTS.md']) {
    assert.ok(documents.includes(file), `${file} is not in the checked documents`)
  }
})

test('relative links and anchors in first-party Markdown resolve', () => {
  const errors = []
  for (const file of documents) {
    eachSpan(file, ({ kind, value, where }) => {
      if (kind !== 'link' || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value)) return
      const [address, hash] = value.split('#')
      const target = decodeURIComponent(address.split('?')[0])
      const resolved = target ? path.posix.join(path.posix.dirname(file), target) : file
      if (!existsSync(path.join(root, resolved))) {
        errors.push(`${where} links to missing ${resolved}; fix the path or restore the file.`)
        return
      }
      if (hash && resolved.endsWith('.md') && !anchors(resolved).has(decodeURIComponent(hash))) {
        errors.push(
          `${where} links to #${hash}, but no heading in ${resolved} has that anchor; fix the link or the heading.`,
        )
      }
    })
  }
  assert.deepEqual(errors, [])
})

test('repository paths and commits named in first-party Markdown exist', () => {
  const errors = []
  for (const file of documents) {
    eachSpan(file, ({ kind, value, where }) => {
      if (kind !== 'code') return
      // Repository-relative paths such as `src/lib/posts.ts`; placeholders and globs are not paths.
      // A path under a missing top-level folder still counts when it names a file type.
      if (
        /^[\w.@-]+(?:\/[\w.@[\]-]+)+\/?$/.test(value) &&
        (topLevel.has(value.split('/')[0]) || fileName.test(path.posix.basename(value))) &&
        !existsSync(path.join(root, value))
      ) {
        errors.push(`${where} names missing path ${value}; update it to the current location.`)
      }
      // A bare file name is a path from the root: `package.json` is one, `posts.ts` is not.
      if (fileName.test(value) && !existsSync(path.join(root, value))) {
        errors.push(`${where} names ${value} without its folder; write the path from the root.`)
      }
      if (/^[0-9a-f]{7,40}$/.test(value) && /[a-f]/.test(value) && /\d/.test(value)) {
        if (!isAncestor(value)) {
          errors.push(
            `${where} cites ${value}, which is not a commit in the history of ${mainRef}.`,
          )
        }
      }
      // A removed file is cited as `<commit>:<path>`, at a commit where it exists.
      const citation = value.match(/^([0-9a-f]{7,40}):[\w./@[\]-]+$/)
      if (citation) {
        let exists = isAncestor(citation[1])
        try {
          git('cat-file', '-e', value)
        } catch {
          exists = false
        }
        if (!exists) {
          errors.push(
            `${where} cites ${value}, but the history of ${mainRef} has no such commit and path.`,
          )
        }
      }
    })
  }
  assert.deepEqual(errors, [])
})

test('each skill has a matching name and a Claude Code link', () => {
  const errors = []
  for (const name of readdirSync(path.join(root, '.agents/skills'))) {
    const link = `.claude/skills/${name}`
    let target
    try {
      target = readlinkSync(path.join(root, link))
    } catch {
      target = null
    }
    if (target !== `../../.agents/skills/${name}`) {
      errors.push(`${link} is not a link to ../../.agents/skills/${name}; create it with ln -s.`)
    }
    if (installedSkills.includes(name)) continue
    const front = readFileSync(path.join(root, `.agents/skills/${name}/SKILL.md`), 'utf8').match(
      /^---\n([\s\S]*?)\n---\n/,
    )?.[1]
    if (front?.match(/^name: (.+)$/m)?.[1] !== name) {
      errors.push(`.agents/skills/${name}/SKILL.md front matter needs "name: ${name}".`)
    }
    if (!/^description: \S/m.test(front ?? '')) {
      errors.push(`.agents/skills/${name}/SKILL.md front matter needs a description.`)
    }
  }
  for (const name of readdirSync(path.join(root, '.claude/skills'))) {
    if (!existsSync(path.join(root, '.agents/skills', name))) {
      errors.push(`.claude/skills/${name} links to a skill that does not exist; remove it.`)
    }
  }
  assert.deepEqual(errors, [])
})
