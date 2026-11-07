# Release readiness

| Gate | Status |
| ---- | ------ |
| Code (workspace architecture + route/insight adoption Batches 1–15) | Chrome inheritance largely complete; factual insight rails expanded |
| Full route Section 14 finished-screen DoD | **not ready** — chrome PASS; staging/RBAC/a11y still open |
| Local contract tests (`check:modules` / `check:workspace` / `check:ui` / modules vitest) | passing on each merged batch |
| Merge to authoritative `main` | Batches 1–15 merged through PR [#196](https://github.com/linkbusinessadvisory/LinkBooks/pull/196) → `0e98a58a` |
| Supabase migrations (premium UI chrome) | none required for chrome batches |
| Security / accounting integrity | no intentional posting/RLS changes; full two-tenant audit **not-yet-verified** |
| Staging authenticated QA | **not executed** |
| Production authorization | **Granted** 2026-11-07 by product owner (Gulshan) |
| Production go-live (Section 18) | **still blocked** — authorization alone is insufficient while DoD/staging/RBAC/a11y/invariants remain open |

## Section 18 remaining blockers before go-live

1. Authenticated staging end-to-end QA (desktop/mobile/keyboard)
2. Deny-path RBAC + cross-company isolation re-proof
3. Manual accessibility (SR / zoom / contrast) on core modules
4. Empty/error/loading honesty audit promoting PARTIAL → PASS where true
5. Accounting invariant / two-tenant security campaign evidence
6. Rollback plan recorded for any production migration apply
7. External integration sandbox validation where claimed

Production URL (existing): https://linkbooks-navy.vercel.app — presence of a URL is **not** Section 14 DONE evidence.
