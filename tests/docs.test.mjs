import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, readlinkSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'

// Structural checks for first-party Markdown: the rules in docs/AGENTS.md that a script can
// decide. Each failure names the file, the problem, and the fix.

// tests/docs-rejects.test.mjs points DOCS_CHECK_ROOT at a fixture with one defect per rule.
const root = process.env.DOCS_CHECK_ROOT ?? path.resolve(import.meta.dirname, '..')
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'pipe' })
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

test('each Markdown paragraph is one physical line', () => {
  // A wrapped line that follows a list can also join the wrong item when it renders.
  // ponytail: line heuristics, not a Markdown parser; move to an AST when a real case slips by.
  const html = /^\s*<(?:!--|\/?(?:details|summary|div|p|table|picture|figure|section|img|br)\b)/i
  const block = /^\s*(?:[-*+]\s|\d+[.)]\s|\||#|$)/
  const errors = []
  for (const file of documents) {
    const lines = proseLines(file)
    // Skill front matter is YAML, not prose.
    const start = lines[0] === '---' ? lines.indexOf('---', 1) + 1 : 0
    let code = false
    for (let index = start + 1; index < lines.length; index++) {
      // An indented code block starts after a blank line and keeps its 4-space indent.
      code = /^ {4}/.test(lines[index]) && (code || !lines[index - 1].trim())
      if (code) continue
      // Compare blockquote lines by the text after their `>` markers.
      const quoted = /^\s*>/.test(lines[index])
      if (quoted !== /^\s*>/.test(lines[index - 1]) && quoted) continue
      const [previous, line] = [lines[index - 1], lines[index]].map((text) =>
        quoted ? text.replace(/^\s*(?:>\s?)+/, '') : text,
      )
      if (block.test(line) || html.test(line)) continue
      if (!previous.trim() || /^\s*(?:\||#)/.test(previous) || html.test(previous)) continue
      errors.push(`${file}:${index + 1} continues the paragraph above; join the two lines.`)
    }
  }
  assert.deepEqual(errors, [])
})

test('standing documents stay within their word budgets', () => {
  // docs/AGENTS.md says how to respond: relocate, condense, then raise with a reason.
  const budgets = {
    'AGENTS.md': 480,
    'docs/AGENTS.md': 1210,
    'docs/architecture.md': 750,
    'docs/design.md': 750,
    'docs/product.md': 560,
    'docs/testing.md': 815,
    '.agents/notes/AGENTS.md': 920,
  }
  const standing = documents.filter((file) => /(?:^|\/)AGENTS\.md$|^docs\/[^/]+\.md$/.test(file))
  const errors = []
  for (const file of standing) {
    if (!(file in budgets)) errors.push(`${file} has no word budget; add one in this test.`)
  }
  for (const [file, budget] of Object.entries(budgets)) {
    if (!existsSync(path.join(root, file))) {
      errors.push(`${file} has a budget but does not exist; remove the budget.`)
      continue
    }
    const words = readFileSync(path.join(root, file), 'utf8').split(/\s+/).filter(Boolean).length
    if (words > budget) {
      errors.push(`${file} has ${words} words; the budget is ${budget}. See docs/AGENTS.md.`)
    }
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

test('Agent Notes follow the lifecycle format', () => {
  const sections = {
    proposed: ['Problem', 'Proposal', 'Alternatives considered', 'Acceptance criteria', 'Risks'],
    implemented: ['Problem', 'Decision', 'Alternatives considered', 'Consequences'],
    rejected: ['Problem', 'Proposal', 'Alternatives considered'],
  }
  const unrecorded = '<!-- agent-note-format: alternatives-not-recorded (pre-format Agent Note) -->'
  // The format started on this date; later notes record their alternatives.
  const formatStart = '2026-10-07'
  const errors = []
  const notes = tracked.filter(
    (file) => file.startsWith('.agents/notes/') && file !== '.agents/notes/AGENTS.md',
  )
  for (const file of notes) {
    const [, , lifecycle, name, ...deeper] = file.split('/')
    const fail = (problem) => errors.push(`${file}: ${problem}. See .agents/notes/AGENTS.md.`)
    if (!sections[lifecycle] || !name || deeper.length) {
      fail('a note sits directly in proposed/, implemented/, or rejected/')
      continue
    }
    if (!/^\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.md$/.test(name)) {
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
    if (lines[3] !== '') fail('line 4 is not blank')
    // A fenced example heading is not a section.
    const headings = proseLines(file).flatMap((line) => line.match(/^## (.+)$/)?.[1] ?? [])
    if (headings[0] !== 'Problem') fail('the body does not open with "## Problem"')
    for (const section of sections[lifecycle]) {
      const waived = section === 'Alternatives considered' && lines.includes(unrecorded)
      if (!headings.includes(section) && !waived) fail(`"## ${section}" is missing`)
    }
    if (lines.includes(unrecorded) && name >= formatStart) {
      fail(`only notes dated before ${formatStart} may waive "## Alternatives considered"`)
    }
    if (lifecycle === 'implemented') {
      for (const section of ['Proposal', 'Plan', 'Migration plan', 'Acceptance criteria']) {
        if (headings.includes(section)) fail(`"## ${section}" is proposal text in a shipped note`)
      }
    }
  }
  assert.deepEqual(errors, [])
})
