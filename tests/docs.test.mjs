import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'

// Structural checks for first-party Markdown: the rules in docs/AGENTS.md that a script can
// decide. Each failure names the file, the problem, and the fix.

const root = path.resolve(import.meta.dirname, '..')
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' })
const tracked = git('ls-files', '--cached', '--others', '--exclude-standard')
  .split('\n')
  .filter((file) => file && existsSync(path.join(root, file)))
const topLevel = new Set(tracked.map((file) => file.split('/')[0]))

// Third-party skills come from `npx skills`; their links are upstream's concern.
const installedSkills = Object.keys(
  JSON.parse(readFileSync(path.join(root, 'skills-lock.json'), 'utf8')).skills,
)
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

function eachSpan(file, visit) {
  proseLines(file).forEach((line, index) => {
    const where = `${file}:${index + 1}`
    for (const [, target] of line
      .replace(/`[^`]*`/g, '')
      .matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      visit({ kind: 'link', value: target, where })
    }
    for (const [, code] of line.matchAll(/`([^`]+)`/g)) visit({ kind: 'code', value: code, where })
  })
}

test('relative links and anchors in first-party Markdown resolve', () => {
  const errors = []
  for (const file of documents) {
    eachSpan(file, ({ kind, value, where }) => {
      if (kind !== 'link' || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value)) return
      const [target, hash] = value.split('#')
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
      if (
        /^[\w.@-]+(?:\/[\w.@[\]-]+)+\/?$/.test(value) &&
        topLevel.has(value.split('/')[0]) &&
        !existsSync(path.join(root, value))
      ) {
        errors.push(`${where} names missing path ${value}; update it to the current location.`)
      }
      if (/^[0-9a-f]{7,40}$/.test(value) && /[a-f]/.test(value) && /\d/.test(value)) {
        try {
          git('cat-file', '-e', `${value}^{commit}`)
        } catch {
          errors.push(`${where} cites ${value}, which is not a commit in this repository.`)
        }
      }
      // A removed file is cited as `<commit>:<path>`, at a commit where it exists.
      if (/^[0-9a-f]{7,40}:[\w./@[\]-]+$/.test(value)) {
        try {
          git('cat-file', '-e', value)
        } catch {
          errors.push(`${where} cites ${value}, but that commit has no such path.`)
        }
      }
    })
  }
  assert.deepEqual(errors, [])
})

test('root AGENTS.md stays within its word budget', () => {
  // AGENTS.md is in every agent session. Move detail behind a pointer before you raise this.
  const budget = 600
  const words = readFileSync(path.join(root, 'AGENTS.md'), 'utf8').split(/\s+/).filter(Boolean)
  assert.ok(
    words.length <= budget,
    `AGENTS.md has ${words.length} words; the budget is ${budget}. Move detail to the doc that owns it.`,
  )
})

test('Agent Notes follow the lifecycle format', () => {
  const sections = {
    proposed: ['Problem', 'Proposal', 'Alternatives considered', 'Acceptance criteria', 'Risks'],
    implemented: ['Problem', 'Decision', 'Alternatives considered', 'Consequences'],
    rejected: ['Problem', 'Proposal', 'Alternatives considered'],
  }
  const unrecorded = '<!-- agent-note-format: alternatives-not-recorded -->'
  const errors = []
  for (const file of tracked.filter((file) => /^\.agents\/notes\/[^/]+\/.+\.md$/.test(file))) {
    const lifecycle = file.split('/')[2]
    const fail = (problem) => errors.push(`${file}: ${problem}. See .agents/notes/AGENTS.md.`)
    if (!sections[lifecycle]) {
      fail(`"${lifecycle}" is not a lifecycle folder (proposed, implemented, rejected)`)
      continue
    }
    if (!/^\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.md$/.test(path.basename(file))) {
      fail('the file name is not YYYY-MM-DD-topic.md')
    }
    const lines = readFileSync(path.join(root, file), 'utf8').split('\n')
    if (!lines[0].startsWith('# Agent Note: ') || lines[1] !== '') {
      fail('line 1 is not "# Agent Note: <title>" followed by a blank line')
    }
    const status = lines[2] ?? ''
    const statusMatches =
      lifecycle === 'rejected'
        ? /^Status: rejected — \S/.test(status)
        : status === `Status: ${lifecycle}`
    if (!statusMatches) fail(`line 3 "${status}" does not match the ${lifecycle}/ folder`)
    const headings = lines.flatMap((line) => line.match(/^## (.+)$/)?.[1] ?? [])
    if (headings[0] !== 'Problem') fail('the body does not open with "## Problem"')
    for (const section of sections[lifecycle]) {
      const waived = section === 'Alternatives considered' && lines.includes(unrecorded)
      if (!headings.includes(section) && !waived) fail(`"## ${section}" is missing`)
    }
    if (lifecycle === 'implemented') {
      for (const section of ['Proposal', 'Plan', 'Acceptance criteria']) {
        if (headings.includes(section)) fail(`"## ${section}" is proposal text in a shipped note`)
      }
    }
  }
  assert.deepEqual(errors, [])
})
