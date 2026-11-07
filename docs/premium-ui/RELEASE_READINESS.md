# Release readiness

| Gate | Status |
| ---- | ------ |
| Code (workspace architecture + route/insight adoption Batches 1–21) | Chrome inheritance largely complete; factual insight rails expanded; prod build unblocked |
| Full route Section 14 finished-screen DoD | **not ready** — chrome PASS; staging/live RBAC/manual a11y still open |
| Local contract tests (`check:modules` / `check:workspace` / `check:ui` / modules vitest) | passing on each merged batch |
| Merge to authoritative `main` | Batches 1–21 merged through PR [#203](https://github.com/linkbusinessadvisory/LinkBooks/pull/203) → `e31e4f7f`; Batch 22 in progress |
| Supabase migrations (premium UI chrome) | none required for chrome batches |
| Security / accounting integrity | local unit invariants available (`npm run test:accounting-invariants`); full two-tenant audit **not-yet-verified** |
| Staging authenticated QA | **not executed** — dedicated `E2E_*` staging credentials are not configured on this workstation |
| Program authorization | **Granted all** 2026-11-07 by product owner (Gulshan): production deploy, staging QA when credentials exist, migrations with rollback+staging proof, CI observation, evidence batches |
| Production deployment | **Deployed** 2026-11-07 — `https://linkbooks-puce.vercel.app` Ready (HTTP 200); not Section 18 go-live |
| Production go-live (Section 18) | **still blocked** — run `npm run check:section18` for the live gate table; `--require-go-live` fails closed while blockers remain |

## Section 18 remaining blockers before go-live

1. Authenticated staging end-to-end QA — requires `E2E_STAGING_ENABLED=true` + dedicated staging host/credentials
2. Deny-path RBAC + cross-company isolation re-proof on live/staging tenants (local unit evidence only through Batch 21)
3. Manual accessibility (SR / zoom / contrast) on core modules beyond fixture axe
4. Staging empty/error walkthrough (local empty/error gates PASS)
5. Accounting invariant / two-tenant campaign on staging/prod tenants (local unit suite scripted as `test:accounting-invariants`)
6. Rollback plan recorded for any production migration apply (see migration register)
7. External integration sandbox validation where claimed

Machine-readable honesty: `npm run check:section18` (add `--require-go-live` only when claiming Section 18 DONE).

Production URL: https://linkbooks-puce.vercel.app — presence of a URL is **not** Section 14/18 DONE evidence.
