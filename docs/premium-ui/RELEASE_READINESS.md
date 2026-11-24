# Release readiness

| Gate | Status |
| ---- | ------ |
| Code (workspace architecture + route/insight adoption Batches 1–21) | Chrome inheritance largely complete; factual insight rails expanded; prod build unblocked |
| Full route Section 14 finished-screen DoD | **not ready** — chrome PASS; staging/live RBAC/manual a11y still open |
| Local contract tests (`check:modules` / `check:workspace` / `check:ui` / modules vitest) | passing on each merged batch |
| Merge to authoritative `main` | Batches 1–21 merged through PR [#203](https://github.com/streakbooks/StreakBooks/pull/203) → `e31e4f7f`; Batch 22 in progress |
| Supabase migrations (premium UI chrome) | none required for chrome batches |
| Security / accounting integrity | local unit invariants available (`npm run test:accounting-invariants`); full two-tenant audit **not-yet-verified** |
| Staging authenticated QA | **not executed** — dedicated `E2E_*` staging credentials are not configured on this workstation |
| Program authorization | **Granted all** 2026-11-07 by product owner (Gulshan): production deploy, staging QA when credentials exist, migrations with rollback+staging proof, CI observation, evidence batches |
| Production deployment | The Vercel alias returned HTTP 200 on 2026-11-07. The deployed commit for the current release remains unverified. |
| Production go-live (Section 18) | **still blocked** — run `npm run check:section18` for the live gate table; `--require-go-live` fails closed while blockers remain |

## Section 18 remaining blockers before go-live

1. Passing authenticated staging end-to-end QA. The shared preflight checks the dedicated staging host, production separation, and configured test account.
2. Deny-path RBAC + cross-company isolation re-proof on live/staging tenants (local unit evidence only through Batch 21)
3. Manual accessibility (SR / zoom / contrast) on core modules beyond fixture axe
4. Staging empty/error walkthrough (local empty/error gates PASS)
5. Accounting invariant / two-tenant campaign on staging/prod tenants (local unit suite scripted as `test:accounting-invariants`)
6. Rollback plan recorded for any production migration apply (see migration register)
7. External integration sandbox validation where claimed
8. Provider evidence tying the production deployment to the release commit

Run `npm run check:section18` to execute the local module checks and report release gates. Add `--require-go-live` to require every gate to pass.

Production URL: https://streakbooks-puce.vercel.app — presence of a URL is **not** Section 14/18 DONE evidence.

## Verify the deployed revision

Vercel production builds publish `/release-revision.json` when the system environment
provides a full `VERCEL_GIT_COMMIT_SHA` and `VERCEL_ENV=production`. The file contains
the Git commit and deployment environment.

Set `E2E_PRODUCTION_URL` to the authorised production HTTPS origin, check out the
release commit, and run `npm run check:section18 -- --verify-production`. The checker
makes a read-only request, rejects redirects and compares the full deployed commit to
`HEAD`. Add `--require-go-live` to require all Section 18 gates to pass.
