import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { defineConfig } from '@playwright/test'

// A dedicated port keeps a preview left running on 8787 from serving stale output to the suite.
const baseURL = process.env.SITE_URL ?? 'http://localhost:8790'
const agentBrowserDirectory = join(homedir(), '.agent-browser', 'browsers')
const orbChrome =
  process.env.AMP_ORB === '1' && existsSync(agentBrowserDirectory)
    ? readdirSync(agentBrowserDirectory)
        .filter((entry) => entry.startsWith('chrome-'))
        .sort()
        .at(-1)
    : undefined
const executablePath = orbChrome && join(agentBrowserDirectory, orbChrome, 'chrome')
if (executablePath && !existsSync(executablePath)) {
  throw new Error(`Amp orb Chrome for Testing is missing: ${executablePath}`)
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
    launchOptions: executablePath ? { executablePath } : { channel: 'chrome' },
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
