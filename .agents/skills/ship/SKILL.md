---
name: ship
description: Ship chensl.me to production. Use when pushing or merging to main, deploying, applying remote D1 migrations, or confirming that a pushed change is live.
---

# Ship chensl.me

A push to `main` deploys production. Cloudflare builds it without waiting for GitHub CI ([delivery](../../../docs/architecture.md#delivery)), so CI and deployment are separate results.

## Steps

1. **Approval.** The owner approved this push, in this conversation, for these commits. An earlier approval does not cover a later push. Done when you can quote the approval.
2. **Outgoing commits.** Run `git fetch origin` and `git log --stat origin/main..HEAD`. Done when every outgoing commit is intended, follows the commit rules in root `AGENTS.md`, and `main` fast-forwards from `origin/main`.
3. **Evidence.** For each surface the commits touch, a check from [Evidence for each change](../../../docs/testing.md#evidence-for-each-change) ran on the final tree and passed. Reuse a result when the tree has not changed since it ran. Done when every surface has a named result, or a named reason why it was not run.
4. **Schema.** When an outgoing commit adds a file to `migrations/`, the remote databases need it before the code deploys. Production and Workers Previews use separate databases. Each command below is a separate action and needs its own approval:

   ```sh
   pnpm exec wrangler d1 migrations apply VOTES --remote --config wrangler.jsonc
   pnpm exec wrangler d1 migrations apply VOTES --remote --preview --config wrangler.jsonc
   ```

   The token needs D1 edit permission. Done when `pnpm exec wrangler d1 migrations list VOTES --remote` (and with `--preview`) lists no unapplied migration.
5. **Push.** Run `git push origin main`. Done when the remote reports the new head.
6. **CI.** Find the run for the pushed commit with `gh run list --branch main --limit 1 --json headSha,status,conclusion,url`, and wait for it. Done when its `headSha` is the pushed commit and it concluded.
7. **Deployment.** Match a Cloudflare deployment record to the pushed commit. When you cannot reach the records, check that production serves the change, for example with `curl -sI https://chensl.me/<changed path>`. A charset proves itself only in production, because local Wrangler adds one to every `text/*` response ([previews](../../../docs/testing.md#previews)). Done when the deployment is confirmed, or reported as unverified.

## Report

Report three facts separately: pushed (the commit range), CI (the run and its result), and deployed (the evidence, or "unverified"). A green CI run does not prove a deployment, and the absence of a GitHub deployment job does not prove that none ran. CI only runs checks by design; that is not a reason for a manual deployment.
