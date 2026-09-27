import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

const [base, directory] = process.argv.slice(2)
assert.ok(
  base && directory,
  'Usage: node scripts/check-appearance.mjs <preview-url> <screenshots-directory>',
)
const output = path.resolve(directory)
mkdirSync(output, { recursive: true })
let session = `appearance-${process.pid}`
let hover = true
let scriptsEnabled = true
const command = (...args) => {
  const response = JSON.parse(
    execFileSync(
      'agent-browser',
      [
        '--session',
        session,
        '--args',
        `--blink-settings=primaryHoverType=${hover ? 2 : 0}`,
        '--json',
        ...args,
      ],
      { encoding: 'utf8', timeout: 60_000 },
    ),
  )
  assert.ok(response.success, response.error)
  return response.data
}
const evaluate = (expression) => command('eval', expression).result
const settle = () =>
  scriptsEnabled
    ? evaluate(
        'document.fonts.ready.then(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))))',
      )
    : command('wait', '300') // Animation-frame callbacks do not run while page scripts are disabled.
const open = (route) => {
  command('open', new URL(route, base).href)
  settle()
  assert.equal(evaluate("matchMedia('(hover: hover)').matches"), hover)
}
const capture = (name) => {
  settle()
  assert.equal(evaluate('devicePixelRatio'), 2)
  assert.equal(
    evaluate('document.documentElement.scrollWidth <= innerWidth'),
    true,
    `${name}: page overflow`,
  )
  command('screenshot', path.join(output, `${name}.png`))
  console.log(`Captured ${name}`)
}
let socket
try {
  open('/')
  command('set', 'viewport', '1280', '844', '2')
  command('set', 'media', 'light')
  evaluate('localStorage.clear()')
  open('/')
  const theme = () =>
    evaluate(`({mode: document.querySelector('[data-theme-toggle]').dataset.themeMode,
    scheme: getComputedStyle(document.documentElement).colorScheme,
    background: getComputedStyle(document.body).backgroundColor})`)
  assert.equal(theme().mode, 'auto')
  for (const [mode, scheme] of [
    ['light', 'light'],
    ['dark', 'dark'],
    ['auto', 'light dark'],
  ]) {
    command('click', '[data-theme-toggle]')
    assert.equal(theme().mode, mode)
    assert.equal(theme().scheme, scheme)
  }
  const lightBackground = theme().background
  command('set', 'media', 'dark')
  settle()
  assert.notEqual(theme().background, lightBackground, 'Auto follows the OS')
  command('click', '[data-theme-toggle]')
  assert.equal(theme().background, lightBackground, 'Forced light overrides a dark OS')
  open('/')
  assert.equal(theme().mode, 'light', 'Forced theme persists across navigation')
  command('click', '[data-theme-toggle]')
  command('set', 'media', 'light')
  assert.equal(theme().scheme, 'dark', 'Forced dark overrides a light OS')
  command('click', '[data-theme-toggle]')
  console.log('Theme cycling, persistence, forced themes and OS tracking passed.')

  for (const width of [1280, 390]) {
    command('set', 'viewport', String(width), '844', '2')
    for (const mode of ['light', 'dark']) {
      command('set', 'media', mode)
      for (const [name, route] of [
        ['home', '/'],
        ['archive', '/blog/'],
        ['article', '/blog/dockertest/'],
        ['404', '/404.html'],
      ]) {
        open(route)
        assert.equal(
          evaluate(
            "[...document.fonts].some(f => f.family.includes('Tsanger') && f.status === 'loaded')",
          ),
          true,
        )
        capture(`${name}-${width}-${mode}`)
      }
    }
  }
  command('set', 'media', 'light')
  for (const width of [320, 479, 481, 599, 601, 768]) {
    command('set', 'viewport', String(width), '844', '2')
    open('/blog/dockertest/')
    capture(`navigation-${width}`)
    evaluate("document.querySelector('.table-scroll').scrollIntoView()")
    capture(`table-${width}`)
  }
  command('set', 'viewport', '1280', '844', '2')
  open('/blog/dockertest/')
  evaluate("document.querySelector('.code-figure').scrollIntoView()")
  capture('code-caption-light')
  command('set', 'media', 'dark')
  capture('code-caption-dark')
  command('focus', '#article-toc a')
  capture('toc-focused')
  command('press', 'Escape')
  capture('toc-dismissed')
  command('focus', '.site-title a')
  command('hover', '#article-toc')
  capture('toc-hovered')
  open('/blog/2024-review/')
  evaluate("document.querySelector('blockquote').scrollIntoView()")
  capture('quote-dark')
  evaluate("document.querySelector('.footnotes').scrollIntoView()")
  capture('footnotes-dark')

  command('close')
  session = `appearance-touch-${process.pid}`
  hover = false
  open('/blog/dockertest/')
  command('set', 'viewport', '390', '844', '2')
  command('click', '.toc-button')
  capture('toc-popover')
  command('press', 'Escape')

  // Keep a raw CDP connection open: disabling scripts must survive the navigation.
  socket = new WebSocket(command('get', 'cdp-url').cdpUrl)
  await new Promise((resolve, reject) => {
    socket.onopen = resolve
    socket.onerror = reject
  })
  let id = 0
  const pending = new Map()
  socket.onmessage = (event) => {
    const response = JSON.parse(event.data)
    if (!pending.has(response.id)) return
    const { resolve, reject } = pending.get(response.id)
    pending.delete(response.id)
    if (response.error) reject(new Error(JSON.stringify(response.error)))
    else resolve(response.result)
  }
  const cdp = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      pending.set(++id, { resolve, reject })
      socket.send(JSON.stringify({ id, method, params, sessionId }))
    })
  const { targetInfos } = await cdp('Target.getTargets')
  const target = targetInfos.find((target) => target.type === 'page' && target.url.startsWith(base))
  assert.ok(target)
  const { sessionId } = await cdp('Target.attachToTarget', {
    targetId: target.targetId,
    flatten: true,
  })
  await cdp('Emulation.setScriptExecutionDisabled', { value: true }, sessionId)
  scriptsEnabled = false
  open('/blog/dockertest/')
  assert.equal(
    evaluate("getComputedStyle(document.querySelector('.theme-toggle')).display"),
    'none',
    'No-script theme control is hidden',
  )
  assert.equal(evaluate("document.querySelectorAll('.code-copy,.back-to-top').length"), 0)
  command('click', '.toc-button')
  assert.equal(evaluate("document.querySelector('#article-toc').matches(':popover-open')"), true)
  capture('no-script-toc')
  await cdp('Emulation.setScriptExecutionDisabled', { value: false }, sessionId)
  scriptsEnabled = true
  const { identifier } = await cdp(
    'Page.addScriptToEvaluateOnNewDocument',
    {
      source:
        "Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('blocked', 'SecurityError') } })",
    },
    sessionId,
  )
  open('/')
  command('click', '[data-theme-toggle]')
  assert.equal(theme().mode, 'light', 'Theme still switches when storage throws')
  await cdp('Page.removeScriptToEvaluateOnNewDocument', { identifier }, sessionId)
  console.log('No-script contents and storage-failure fallback passed.')
} finally {
  socket?.close()
  command('close')
}
console.log('Appearance checks passed; screenshots require visual inspection.')
