import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

// tests/docs.test.mjs passes on this repository; this proves that each of its rules can fail.
// The fixture is a git repository with one defect per rule, and the test expects every message.

test('the document checks reject each defect', (t) => {
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

  write('skills-lock.json', '{ "skills": {} }\n')
  write('AGENTS.md', '# Root\n')
  write('docs/AGENTS.md', '# Standard\n')
  write('.agents/notes/AGENTS.md', '# Notes\n')
  write('src/keep.txt', '\n')
  git('init', '-q')
  git('add', '.')
  git('commit', '-q', '-m', 'base')
  // A commit that left the history: `cat-file` still finds it, the history of HEAD does not.
  write('src/keep.txt', 'gone\n')
  git('commit', '-q', '-am', 'gone')
  const dangling = git('rev-parse', '--short=12', 'HEAD')
  git('reset', '-q', '--hard', 'HEAD~1')

  write(
    'docs/guide.md',
    [
      '# Guide',
      '',
      'See [missing](missing.md) and [anchor](#nowhere).',
      '',
      '[ref]: absent.md',
      '',
      'Paths `src/missing.ts` and `Missing.astro`.',
      '',
      `Commit \`${dangling}\` and file \`${dangling}:src/keep.txt\`.`,
      '',
      'A wrapped',
      'paragraph.',
      '',
      '- An item',
      '  continued.',
      '',
      'Press',
      '<kbd>Ctrl</kbd> to copy.',
      '',
    ].join('\n'),
  )
  write('.agents/skills/bad/SKILL.md', '---\nname: wrong\ndescription: Bad.\n---\n')
  mkdirSync(path.join(root, '.claude/skills'), { recursive: true })
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
    `docs/guide.md:9 cites ${dangling}, which is not a commit in the history of HEAD`,
    `docs/guide.md:9 cites ${dangling}:src/keep.txt, but the history of HEAD has no such`,
    'docs/guide.md:12 continues the paragraph above',
    'docs/guide.md:15 continues the paragraph above',
    'docs/guide.md:18 continues the paragraph above',
    'docs/guide.md has no word budget',
    '.claude/skills/bad is not a link',
    '.agents/skills/bad/SKILL.md front matter needs "name: bad"',
    '.claude/skills/gone links to a skill that does not exist',
    '.agents/notes/stray.md: a note sits directly in',
    '2026-10-08-late.md: line 4 is not blank',
    '2026-10-08-late.md: only notes dated before 2026-10-07 may waive',
    '2026-10-08-late.md: "## Migration plan" is proposal text',
  ]
  const missing = expected.filter((message) => !run.stdout.includes(message))
  assert.deepEqual(missing, [], `Output of the checks:\n${run.stdout}`)
})
