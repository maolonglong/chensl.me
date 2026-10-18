import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { test } from 'node:test'

// GET /api/github/repos/<owner>/<repo>/ refreshes the numbers of the repository cards. These
// tests call the handler with a stubbed GitHub, so they decide what reaches GitHub and which
// cache headers each outcome carries; the Workers Cache that reads the headers is not simulated.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && context.parentURL) {
      const candidate = new URL(`${specifier}.ts`, context.parentURL)
      if (existsSync(candidate)) return nextResolve(candidate.href, context)
    }
    return nextResolve(specifier, context)
  },
})
const { handleGitHubRepo } = await import('../src/lib/github-endpoint.ts')
const snapshot = JSON.parse(
  readFileSync(new URL('../src/data/github-repos.json', import.meta.url), 'utf8'),
)

const key = 'sony/gobreaker'
const githubBody = {
  full_name: 'sony/gobreaker',
  description: ' Circuit Breaker implemented in Go ',
  stargazers_count: 3812,
  forks_count: 241,
  language: 'Go',
  archived: false,
  pushed_at: '2026-10-01T02:03:04Z',
  owner: { login: 'sony', avatar_url: 'https://avatars.githubusercontent.com/u/1?v=4' },
}

function github(respond = () => Response.json(githubBody)) {
  const calls = []
  const fetch = async (url, init) => {
    calls.push({ url: String(url), headers: new Headers(init?.headers) })
    return respond()
  }
  return { calls, fetch }
}

function limiter(success = true) {
  const keys = []
  return { keys, binding: { limit: async ({ key }) => (keys.push(key), { success }) } }
}

const request = (path, init = {}) =>
  new Request(`https://chensl.me${path}`, {
    ...init,
    headers: { 'cf-connecting-ip': '203.0.113.7', ...init.headers },
  })

test('an allowlisted repository returns the trimmed GitHub fields with edge and browser cache headers', async () => {
  const upstream = github()
  const rate = limiter()
  const response = await handleGitHubRepo(
    request(`/api/github/repos/${key}/`),
    { READ_LIMITER: rate.binding },
    upstream.fetch,
  )
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    name: 'sony/gobreaker',
    description: 'Circuit Breaker implemented in Go',
    stars: 3812,
    forks: 241,
    language: 'Go',
    archived: false,
    pushedAt: '2026-10-01T02:03:04Z',
  })
  // Browsers keep it for 10 minutes; the edge for an hour, then serves it stale for up to a day
  // while it refreshes. s-maxage would disable stale-while-revalidate in Workers Cache.
  assert.equal(response.headers.get('cache-control'), 'public, max-age=600')
  assert.equal(
    response.headers.get('cdn-cache-control'),
    'max-age=3600, stale-while-revalidate=86400',
  )
  assert.doesNotMatch(response.headers.get('cache-control'), /s-maxage/)
  assert.match(response.headers.get('content-type'), /^application\/json/)
  assert.deepEqual(rate.keys, ['github:203.0.113.7'])
  assert.equal(upstream.calls.length, 1)
  const [call] = upstream.calls
  assert.equal(call.url, 'https://api.github.com/repos/sony/gobreaker')
  assert.equal(call.headers.get('user-agent'), 'chensl.me')
  assert.equal(call.headers.get('accept'), 'application/vnd.github+json')
  assert.equal(call.headers.get('x-github-api-version'), '2022-11-28')
  assert.equal(call.headers.has('authorization'), false, 'no token, no Authorization header')
})

test('GITHUB_TOKEN authenticates the GitHub request and never reaches the response', async () => {
  const token = 'github_pat_TEST_ONLY_not_a_real_token'
  const upstream = github()
  const response = await handleGitHubRepo(
    request(`/api/github/repos/${key}/`),
    { READ_LIMITER: limiter().binding, GITHUB_TOKEN: token },
    upstream.fetch,
  )
  assert.equal(upstream.calls[0].headers.get('authorization'), `Bearer ${token}`)
  const text = await response.text()
  assert.doesNotMatch(text, /TEST_ONLY/)
  for (const [, value] of response.headers) assert.doesNotMatch(value, /TEST_ONLY/)
})

test('paths outside the allowlist get a cacheable 404 without a rate-limit slot or a GitHub call', async () => {
  const upstream = github()
  const rate = limiter()
  for (const path of [
    '/api/github/repos/torvalds/linux/',
    '/api/github/repos/Sony/gobreaker/',
    '/api/github/repos/sony/gobreaker',
    '/api/github/repos/sony/gobreaker/?refresh=1',
    '/api/github/repos/sony/gobreaker/issues/',
    '/api/github/repos/sony/',
    '/api/github/repos/sony%2Fgobreaker/',
    '/api/github/repos/sony/gobreaker/../../users/sony/',
    '/api/github/users/sony/',
    '/api/github/',
    '/api/github/repos/__proto__/x/',
    '/api/github/repos/constructor/x/',
  ]) {
    const response = await handleGitHubRepo(
      request(path),
      { READ_LIMITER: rate.binding },
      upstream.fetch,
    )
    assert.equal(response.status, 404, path)
    assert.equal(response.headers.get('cache-control'), 'public, max-age=3600', path)
  }
  assert.equal(upstream.calls.length, 0)
  assert.deepEqual(rate.keys, [])
})

test('every repository in the snapshot is reachable', async () => {
  for (const repo of Object.keys(snapshot)) {
    const upstream = github()
    const response = await handleGitHubRepo(
      request(`/api/github/repos/${repo}/`),
      { READ_LIMITER: limiter().binding },
      upstream.fetch,
    )
    assert.equal(response.status, 200, repo)
    assert.equal(upstream.calls[0].url, `https://api.github.com/repos/${repo}`)
  }
})

test('methods other than GET and HEAD get 405 and HEAD gets the GET headers', async () => {
  const upstream = github()
  for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS']) {
    const response = await handleGitHubRepo(
      request(`/api/github/repos/${key}/`, { method }),
      { READ_LIMITER: limiter().binding },
      upstream.fetch,
    )
    assert.equal(response.status, 405, method)
    assert.equal(response.headers.get('allow'), 'GET, HEAD')
    assert.equal(response.headers.get('cache-control'), 'private, no-store')
  }
  assert.equal(upstream.calls.length, 0)
  const head = await handleGitHubRepo(
    request(`/api/github/repos/${key}/`, { method: 'HEAD' }),
    { READ_LIMITER: limiter().binding },
    upstream.fetch,
  )
  assert.equal(head.status, 200)
  assert.equal(head.headers.get('cache-control'), 'public, max-age=600')
})

test('a rate-limited client gets an uncacheable 429 and GitHub is not called', async () => {
  const upstream = github()
  const response = await handleGitHubRepo(
    request(`/api/github/repos/${key}/`),
    { READ_LIMITER: limiter(false).binding },
    upstream.fetch,
  )
  assert.equal(response.status, 429)
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
  assert.equal(upstream.calls.length, 0)
})

test('a GitHub failure returns the build snapshot, marked stale, cached for five minutes only', async () => {
  const failures = {
    'rate limit 403': () => new Response('{"message":"API rate limit exceeded"}', { status: 403 }),
    'rate limit 429': () => new Response('{}', { status: 429 }),
    'server error': () => new Response('bad gateway', { status: 502 }),
    'repository gone': () => new Response('{}', { status: 404 }),
    'network error': () => {
      throw new TypeError('network connection lost')
    },
    timeout: () => {
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError')
    },
    'invalid JSON': () => new Response('<html>', { status: 200 }),
    'unexpected shape': () => Response.json({ message: 'odd' }),
  }
  for (const [name, respond] of Object.entries(failures)) {
    const response = await handleGitHubRepo(
      request(`/api/github/repos/${key}/`),
      { READ_LIMITER: limiter().binding },
      github(respond).fetch,
    )
    assert.equal(response.status, 200, name)
    assert.deepEqual(await response.json(), { ...snapshot[key], stale: true }, name)
    assert.equal(response.headers.get('cache-control'), 'public, max-age=300', name)
    assert.equal(response.headers.get('cdn-cache-control'), null, name)
  }
})
