# Release readiness

| Gate | Status |
| ---- | ------ |
| Code (workspace architecture + route/insight adoption Batches 1–18) | Chrome inheritance largely complete; factual insight rails expanded; prod build unblocked |
| Full route Section 14 finished-screen DoD | **not ready** — chrome PASS; staging/RBAC/manual a11y still open |
| Local contract tests (`check:modules` / `check:workspace` / `check:ui` / modules vitest) | passing on each merged batch |
| Merge to authoritative `main` | Batches 1–19 merged through PR [#201](https://github.com/linkbusinessadvisory/LinkBooks/pull/201) → `3db2a508`; Batch 20 in progress |
| Supabase migrations (premium UI chrome) | none required for chrome batches |
| Security / accounting integrity | no intentional posting/RLS changes; full two-tenant audit **not-yet-verified** |
| Staging authenticated QA | **not executed** — dedicated `E2E_*` staging credentials are not configured on this workstation |
| Program authorization | **Granted all** 2026-11-07 by product owner (Gulshan): production deploy, staging QA when credentials exist, migrations with rollback+staging proof, CI observation, evidence batches |
| Production deployment | **Deployed** 2026-11-07 — `https://linkbooks-puce.vercel.app` Ready (HTTP 200); not Section 18 go-live |
| Production go-live (Section 18) | **still blocked** — authorization removes the “no auth” gate only; DoD/staging/RBAC/a11y/invariants remain evidence-gated |

## Section 18 remaining blockers before go-live

1. Authenticated staging end-to-end QA (desktop/mobile/keyboard) — requires `E2E_STAGING_ENABLED=true` + dedicated staging host/credentials
2. Deny-path RBAC + cross-company isolation re-proof on live/staging tenants (Batch 20 adds local `assertCompanyPermission` / `assertCompanyMember` deny-path unit evidence only)
3. Manual accessibility (SR / zoom / contrast) on core modules beyond fixture axe (Batch 20 fixes Columns/Clear label-in-name on shared controls)
4. Empty/error/loading honesty audit promoting PARTIAL → PASS where true
5. Accounting invariant / two-tenant security campaign evidence
6. Rollback plan recorded for any production migration apply (see migration register)
7. External integration sandbox validation where claimed

Production URL (Vercel alias after 2026-11-07 deploy): https://linkbooks-puce.vercel.app — deployment succeeded; presence of a URL is **not** Section 14/18 DONE evidence.
