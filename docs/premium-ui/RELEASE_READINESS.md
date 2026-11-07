# Release readiness

| Gate | Status |
| ---- | ------ |
| Code (workspace architecture + route/insight adoption Batches 1–15) | Chrome inheritance largely complete; factual insight rails expanded |
| Full route Section 14 finished-screen DoD | **not ready** — chrome PASS; staging/RBAC/a11y still open |
| Local contract tests (`check:modules` / `check:workspace` / `check:ui` / modules vitest) | passing on each merged batch |
| Merge to authoritative `main` | Batches 1–14 merged (#182–#195); Batch 15 in progress |
| Supabase migrations | none required for premium UI chrome batches |
| Security / accounting integrity | no intentional posting/RLS changes; full two-tenant audit not-yet-verified |
| Staging authenticated QA | not executed |
| Production deployment | **blocked** — no authorization |

Production remains blocked until Section 18 gates pass and explicit authorization is given.
