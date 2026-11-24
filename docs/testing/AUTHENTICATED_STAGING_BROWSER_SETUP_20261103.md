# StreakBooks — authenticated staging-browser acceptance

Date: 3 November 2026.

## Current status

The repository provides a real authenticated Playwright staging smoke suite and a guarded GitHub Actions job, but the job will run only after the owner configures staging variables and secrets. **Do not claim browser testing has passed merely because the smoke test was discovered in CI.** The optional staging browser job reports `skipped` until enabled.

## Safe staging prerequisites

1. Deploy an isolated StreakBooks staging site at a dedicated HTTPS hostname (for example `staging.<your-domain>`). It must not point at production. Configure the staging site's own Supabase Auth redirect allowlist.
2. Use an isolated non-production Supabase project or demonstrably disposable staging data. Create a dedicated non-admin test account with access to one company. The smoke tests only navigate and inspect; they do not approve, pay, code, match, or post.
3. Ensure the staging site is accessible from GitHub Actions runners. If protected by an external preview password, configure access without exposing secrets in code or logs.
4. Confirm that the staging deployment under test contains the PR commit being reviewed. A fixed staging URL running older `main` tests staging health, **not the PR code**; do not treat that as proof of PR UI behavior.

## GitHub repository settings

In the `streakbooks/StreakBooks` repository, open **Settings → Secrets and variables → Actions**.

Under **Variables**, add:

| Variable | Example / purpose |
|---|---|
| `E2E_STAGING_ENABLED` | `true` only when staging is prepared |
| `E2E_STAGING_URL` | `https://staging.example.com` (actual dedicated HTTPS root) |
| `E2E_EXPECTED_STAGING_HOST` | `staging.example.com` (exact hostname, no scheme) |
| `E2E_PRODUCTION_URL` | Actual production root HTTPS URL, used only to prevent accidentally testing production |

Under **Secrets**, add:

| Secret | Purpose |
|---|---|
| `E2E_STAGING_EMAIL` | Dedicated staging test-user email |
| `E2E_STAGING_PASSWORD` | Dedicated staging test-user password |

Never put real credentials in Git commits, comments, issues or ChatGPT messages. Do not copy production credentials into staging. These values cannot be configured by merely editing the GitHub workflow.

## How the gate works

- Each PR first runs `validate`: `npm ci`, TypeScript, changed-file ESLint, the unit tests, the navigation source audit, Playwright test discovery, and the production build.
- Once `E2E_STAGING_ENABLED=true`, a **trusted same-repository PR** runs `staging-browser` after `validate`. Fork PRs cannot access the staged secrets.
- Before browser install/login, `node scripts/check-staging-target.mjs` requires HTTPS, the exact expected host, a different production host, and nonempty test credentials. It never logs secrets.
- The staging job then installs Chromium and executes `e2e/staging-smoke.spec.ts` with actual authentication. No `test.skip` bypass exists in that suite. Login verifies the browser is still on the approved staging host **before entering credentials**.
- Screenshots, video and trace recording are disabled for these staging smoke tests, because financial records may contain private information.
- `workflow_dispatch` can manually verify staging. Click **Actions → StreakBooks quality gates → Run workflow** on a trusted branch. Staging is still opt-in through the variables and secrets above.
- After a real green staging run, configure your repository's branch protection/ruleset to require both `validate` and `staging-browser` check results before merging. Do not enable `staging-browser` as required before configuration is validated.

## What the smoke suite actually checks

- Real staging sign-in and access to the app navigation.
- Sales invoices and Purchases bills expose Saved views.
- Banking search focuses on `/` but permits typing `/` in an input.
- Mobile Banking switches between cards and the existing ledger table at a narrow viewport, even with an empty staging ledger.

The existing broader `e2e/native-navigation.spec.ts` remains available for seeded and more exhaustive manual browser testing, but is not the required staging smoke gate because some tests depend on optional records and wider product states. Passing a smoke suite does **not** prove every financial workflow or all PR-specific code is tested.

## Manual Windows verification

Open a PowerShell terminal in `D:\MyApp\StreakBooks` and preserve any uncommitted changes before pulling:

```powershell
git checkout main
git pull origin main
npm.cmd ci
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
```

To run authenticated staging tests locally, set `E2E_STAGING_ENABLED`, `E2E_BASE_URL`, `E2E_EXPECTED_STAGING_HOST`, `E2E_PRODUCTION_URL`, `E2E_EMAIL`, and `E2E_PASSWORD` as **private process environment values** (never committed) and run:

```powershell
node scripts/check-staging-target.mjs
npm.cmd run test:e2e -- e2e/staging-smoke.spec.ts
```

The runner must reach the configured staging URL and must have Chromium installed (`npx playwright install chromium` if necessary).

## Remaining work / limitations

- The repository cannot automatically discover or safely invent the owner's exact Vercel staging URL, production URL or staging account. GitHub repository variables and secrets must be configured in the account.
- A green smoke test against a static staging hostname does not verify that the deployment contains the PR commit; align your staging deployment to the PR SHA before making it a PR merge gate.
- This work creates no new Supabase users/projects, no migrations, no production access, and no financial transactions.
