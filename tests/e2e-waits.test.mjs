import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { test } from 'node:test'

const e2e = new URL('../e2e/', import.meta.url)

// A fixed sleep passes on a fast machine and fails on a slow one. Browser specs wait for a state,
// an event, or a fake-clock step instead (docs/testing.md).
test('browser specs wait for a state instead of a fixed time', async () => {
  const offenders = []
  for (const name of await readdir(e2e)) {
    const lines = (await readFile(new URL(name, e2e), 'utf8')).split('\n')
    lines.forEach((line, index) => {
      if (/\bwaitForTimeout\(/.test(line)) offenders.push(`e2e/${name}:${index + 1}`)
    })
  }
  assert.deepEqual(offenders, [])
})
