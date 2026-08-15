#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

function usage() {
  return `Usage: node scripts/fetch-release-notes.mjs --repo OWNER/REPO --from TAG [options]

Fetch stable GitHub release notes newer than --from and up to --to.

Options:
  --repo OWNER/REPO  GitHub repository to query (required)
  --from TAG        Exclude this release and all older releases (required)
  --to TAG          Include releases through this tag (default: latest)
  --output PATH     Write Markdown to PATH instead of stdout
  --include-prereleases  Include prereleases in the result
  --help            Show this help message

Example:
  node scripts/fetch-release-notes.mjs \\
    --repo gohugoio/hugo --from v0.164.0 --to latest \\
    --output docs/release-notes/hugo-0.164.0-to-latest.md
`
}

function parseArguments(args) {
  const options = { includePrereleases: false, to: 'latest' }

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === '--help') return { help: true }
    if (argument === '--include-prereleases') {
      options.includePrereleases = true
      continue
    }
    if (!['--repo', '--from', '--to', '--output'].includes(argument)) {
      throw new Error(`Unknown option: ${argument}`)
    }
    const value = args[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${argument}`)
    options[argument.slice(2)] = value
    index += 1
  }

  if (!options.repo || !/^[^/\s]+\/[^/\s]+$/.test(options.repo)) {
    throw new Error('--repo must be in OWNER/REPO format')
  }
  if (!options.from) throw new Error('--from is required')
  return options
}

async function fetchReleases(repo) {
  const headers = { Accept: 'application/vnd.github+json' }
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`

  const releases = []
  for (let page = 1; ; page += 1) {
    const response = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=100&page=${page}`, { headers })
    if (!response.ok) throw new Error(`GitHub API request failed: ${response.status} ${response.statusText}`)
    const batch = await response.json()
    if (!Array.isArray(batch)) throw new Error('GitHub API returned an unexpected response')
    releases.push(...batch)
    if (batch.length < 100) return releases
  }
}

function selectReleases(releases, { from, to, includePrereleases }) {
  const filtered = releases.filter(release => !release.draft && (includePrereleases || !release.prerelease))
  const fromIndex = filtered.findIndex(release => release.tag_name === from)
  if (fromIndex === -1) throw new Error(`Could not find starting release: ${from}`)

  const upperBound = to === 'latest'
    ? 0
    : filtered.findIndex(release => release.tag_name === to)
  if (upperBound === -1) throw new Error(`Could not find ending release: ${to}`)
  if (upperBound > fromIndex) throw new Error(`--to (${to}) must be newer than --from (${from})`)

  return filtered.slice(upperBound, fromIndex)
}

function renderMarkdown(repo, from, releases) {
  const now = new Date().toISOString()
  const lines = [
    `# Release notes: ${repo}`,
    '',
    `Generated: ${now}`,
    `Range: releases after ${from} through ${releases[0]?.tag_name ?? from}.`,
    '',
  ]

  if (releases.length === 0) {
    lines.push('No matching releases found.', '')
    return lines.join('\n')
  }

  for (const release of releases) {
    lines.push(`## [${release.name || release.tag_name}](${release.html_url})`, '')
    lines.push(`Published: ${release.published_at ?? 'unknown'}`, '')
    lines.push(release.body?.trim() || '_No release notes provided._', '')
  }
  return lines.join('\n')
}

async function main() {
  const options = parseArguments(process.argv.slice(2))
  if (options.help) {
    process.stdout.write(usage())
    return
  }

  const releases = selectReleases(await fetchReleases(options.repo), options)
  const markdown = renderMarkdown(options.repo, options.from, releases)
  if (!options.output) {
    process.stdout.write(markdown)
    return
  }

  await mkdir(path.dirname(options.output), { recursive: true })
  await writeFile(options.output, markdown)
  process.stderr.write(`Wrote ${releases.length} release note(s) to ${options.output}\n`)
}

main().catch(error => {
  process.stderr.write(`${error.message}\n`)
  process.exitCode = 1
})
