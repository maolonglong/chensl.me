import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

// tests/docs.test.mjs passes on this repository; this proves that each of its rules can fail.
// The fixture is a git repository with one defect per rule, and the test expects every message.
// It also holds valid cases, and expects no message for them.

test('the document checks reject each defect and accept valid cases', (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'docs-rejects-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const write = (file, text) => {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    writeFileSync(path.join(root, file), text)
  }
  const git = (...args) =>
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
      cwd: root,
      encoding: 'utf8',
    }).trim()
  const note = (title, status, sections) =>
    [`# Agent Note: ${title}`, '', `Status: ${status}`, '', ...sections, ''].join('\n')

  write('skills-lock.json', '{ "skills": {} }\n')
  write('AGENTS.md', `# Root\n\n${'word '.repeat(500)}\n`)
  write('docs/AGENTS.md', '# Standard\n')
  write('.agents/notes/AGENTS.md', '# Notes\n')
  write('src/keep.txt', '\n')
  git('init', '-q', '-b', 'main')
  git('add', '.')
  git('commit', '-q', '-m', 'base')
  const base = git('rev-parse', '--short=12', 'HEAD')
  // The checkout is a branch. Its own commit is in the history of HEAD, not of main, and a
  // squash merge would leave it out.
  git('switch', '-q', '-c', 'feature')
  write('src/keep.txt', 'feature\n')
  git('commit', '-q', '-am', 'feature')
  const branchOnly = git('rev-parse', '--short=12', 'HEAD')
  // A commit that left the history: `cat-file` still finds it, no history does.
  write('src/keep.txt', 'gone\n')
  git('commit', '-q', '-am', 'gone')
  const dangling = git('rev-parse', '--short=12', 'HEAD')
  git('reset', '-q', '--hard', 'HEAD~1')

  write(
    'docs/guide.md',
    [
      '# Guide', // 1
      '',
      'See [missing](missing.md) and [anchor](#nowhere).', // 3
      '',
      '[ref]: absent.md', // 5
      '',
      'Paths `src/missing.ts`, `Missing.astro`, and `gone/missing.ts`.', // 7
      '',
      `Commits \`${dangling}\`, \`${branchOnly}\`, and \`${base}:nope.txt\`.`, // 9
      '',
      'A wrapped', // 11
      'paragraph.', // 12
      '',
      '- An item', // 14
      '  continued.', // 15
      '',
      'Press', // 17
      '<kbd>Ctrl</kbd> to copy.', // 18
      '',
      '> A quoted', // 20
      '> wrap.', // 21
      '',
      'Valid: [angled](<../AGENTS.md>), [encoded](../AGENT%53.md), [query](../AGENTS.md?plain=1).', // 23
      '',
      '    indented code', // 25
      '    more code', // 26
      '',
      `Valid: \`${base}\` and \`${base}:src/keep.txt\`.`, // 28
      '',
    ].join('\n'),
  )
  write('.agents/skills/bad/SKILL.md', '---\nname: wrong\ndescription: Bad.\n---\n')
  write('.agents/skills/plain/SKILL.md', '---\nname: plain\n---\n')
  mkdirSync(path.join(root, '.claude/skills'), { recursive: true })
  symlinkSync('../../.agents/skills/plain', path.join(root, '.claude/skills/plain'))
  symlinkSync('../../.agents/skills/gone', path.join(root, '.claude/skills/gone'))
  write('.agents/notes/stray.md', '# Stray\n')
  write(
    '.agents/notes/implemented/2026-10-08-late.md',
    [
      '# Agent Note: Late',
      '',
      'Status: implemented',
      'Extra.',
      '## Problem',
      '## Decision',
      '<!-- agent-note-format: alternatives-not-recorded (pre-format Agent Note) -->',
      '## Consequences',
      '## Migration plan',
      '',
    ].join('\n'),
  )
  write(
    '.agents/notes/rejected/2026-10-08-vague.md',
    note('Vague', 'rejected', ['## Problem', '', '## Alternatives considered']),
  )
  write(
    '.agents/notes/implemented/2026-10-08-fenced.md',
    note('Fenced', 'implemented', ['## Problem', '', '```markdown', '## Decision', '```']),
  )
  write(
    '.agents/notes/implemented/2026-10-08-good.md',
    note('Good', 'implemented', [
      '## Problem',
      '',
      '## Decision',
      '',
      '```markdown',
      '## Proposal',
      '```',
      '',
      '## Alternatives considered',
      '',
      '## Consequences',
    ]),
  )

  // NODE_TEST_CONTEXT would make the inner run report to this runner instead of to stdout.
  const env = { ...process.env, DOCS_CHECK_ROOT: root }
  delete env.NODE_TEST_CONTEXT
  const run = spawnSync(process.execPath, ['--test', 'tests/docs.test.mjs'], {
    cwd: path.resolve(import.meta.dirname, '..'),
    env,
    encoding: 'utf8',
  })
  assert.notEqual(run.status, 0, 'the checks passed a fixture full of defects')
  const expected = [
    'docs/guide.md:3 links to missing docs/missing.md',
    'docs/guide.md:3 links to #nowhere',
    'docs/guide.md:5 links to missing docs/absent.md',
    'docs/guide.md:7 names missing path src/missing.ts',
    'docs/guide.md:7 names Missing.astro without its folder',
    'docs/guide.md:7 names missing path gone/missing.ts',
    `docs/guide.md:9 cites ${dangling}, which is not a commit in the history of main`,
    `docs/guide.md:9 cites ${branchOnly}, which is not a commit in the history of main`,
    `docs/guide.md:9 cites ${base}:nope.txt, but the history of main has no such`,
    'docs/guide.md:12 continues the paragraph above',
    'docs/guide.md:15 continues the paragraph above',
    'docs/guide.md:18 continues the paragraph above',
    'docs/guide.md:21 continues the paragraph above',
    'docs/guide.md has no word budget',
    'AGENTS.md has 502 words; the budget is',
    '.claude/skills/bad is not a link',
    '.agents/skills/bad/SKILL.md front matter needs "name: bad"',
    '.agents/skills/plain/SKILL.md front matter needs a description',
    '.claude/skills/gone links to a skill that does not exist',
    '.agents/notes/stray.md: a note sits directly in',
    '2026-10-08-late.md: line 4 is not blank',
    '2026-10-08-late.md: only notes dated before 2026-10-07 may waive',
    '2026-10-08-late.md: "## Migration plan" is proposal text',
    '2026-10-08-vague.md: line 3 "Status: rejected" does not match the rejected/ folder',
    '2026-10-08-vague.md: "## Proposal" is missing',
    '2026-10-08-fenced.md: "## Decision" is missing',
  ]
  const unexpected = [
    'docs/guide.md:23',
    'docs/guide.md:25',
    'docs/guide.md:26',
    'docs/guide.md:28',
    '2026-10-08-good.md',
  ]
  const output = `Output of the checks:\n${run.stdout}`
  assert.deepEqual(
    expected.filter((message) => !run.stdout.includes(message)),
    [],
    output,
  )
  assert.deepEqual(
    unexpected.filter((message) => run.stdout.includes(message)),
    [],
    output,
  )
})
