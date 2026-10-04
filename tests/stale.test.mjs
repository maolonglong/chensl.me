import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isStaleSince } from '../src/lib/stale.ts'

test('staleness starts strictly after two calendar years, including across a leap year', () => {
  const now = Date.parse('2025-03-01T12:34:56Z')
  assert.equal(isStaleSince(new Date('2023-03-01T12:34:56Z'), now), false)
  assert.equal(isStaleSince(new Date('2023-03-01T12:34:55.999Z'), now), true)
  assert.equal(isStaleSince(new Date('2023-03-01T12:34:56.001Z'), now), false)
})
