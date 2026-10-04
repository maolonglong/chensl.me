import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { defineConfig } from '@playwright/test'

// A dedicated port keeps a preview left running on 8787 from serving stale output to the suite.
const baseURL = process.env.SITE_URL ?? 'http://localhost:8790'
// Use CHROME_PATH when set, else the system Chrome. Without a system Chrome, as in cloud agent
// images, use the newest Chrome for Testing that agent-browser installed.
function chromeLaunchOptions() {
  if (process.env.CHROME_PATH) return { executablePath: process.env.CHROME_PATH }
  const system = {
    darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    linux: '/opt/google/chrome/chrome',
  }[process.platform]
  if (!system || existsSync(system)) return { channel: 'chrome' }
  const directory = join(homedir(), '.agent-browser', 'browsers')
  const newest = existsSync(directory)
    ? readdirSync(directory)
        .filter((entry) => entry.startsWith('chrome-'))
        .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
        .at(-1)
    : undefined
  const executablePath = newest && join(directory, newest, 'chrome')
  if (executablePath && existsSync(executablePath)) return { executablePath }
  throw new Error(
    `No Chrome found: set CHROME_PATH, or install Chrome at ${system} or with agent-browser`,
  )
}
// The upvote specs write to D1, so only a disposable local preview is acceptable.
if (!['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname)) {
  throw new Error(`SITE_URL must be a local preview, got ${baseURL}`)
}

export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.spec.mjs',
  timeout: 60_000,
  expect: { timeout: 5_000 },
  // Retries would hide the flakiness these geometry and timing checks exist to expose.
  retries: 0,
  workers: 3,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  outputDir: 'test-results',
  use: {
    baseURL,
    launchOptions: chromeLaunchOptions(),
    deviceScaleFactor: 2,
    viewport: { width: 1280, height: 844 },
    trace: 'retain-on-failure',
  },
  // Serves the production build (run `pnpm build` first) with local D1, like the deployed Worker.
  webServer: process.env.SITE_URL
    ? undefined
    : {
        command:
          'pnpm exec wrangler d1 migrations apply VOTES --local && pnpm exec wrangler dev --port 8790',
        url: baseURL,
        reuseExistingServer: false,
        timeout: 120_000,
      },
})
