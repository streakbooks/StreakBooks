# Empty / error honesty audit

Labels: `PASS` | `PARTIAL` | `FAIL` | `N/A` | `NOT VERIFIED`.

| Check | Status | Evidence |
| ----- | ------ | -------- |
| `EmptyState` hides CTA unless `onActionClick` or `action` provided | PASS | `src/components/common/states.tsx` |
| Source gate: `actionLabel` must pair with handler/action | PASS | `npm run check:empty` (wired into `check:modules`) |
| Bills empty CTA was dead `actionLabel` only | PASS (fixed Batch 16) | Native `Link` to `/purchases/bills/new` |
| Banking / recurring empty CTAs | PASS | Focus create field / open create dialog |
| Fixture advertises unavailable action without rendering button | PASS | `e2e/ui` “Unavailable action” count 0 |
| `ErrorState` only renders Try again when `onRetry` is provided | PASS | `states.tsx` (Batch 20 re-confirmed) |
| Every nested empty/error path audited | PARTIAL | High-traffic samples; full route walk still open |
| Authenticated staging empty/error walkthrough | NOT VERIFIED | Authorized; `E2E_*` unset |

**Verdict:** enforcement + real fixes landed; full route-by-route empty/error DoD remains **IN PROGRESS**.
