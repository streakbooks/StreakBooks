# Empty / error honesty audit (Batch 16)

Labels: `PASS` | `PARTIAL` | `FAIL` | `N/A`.

| Check | Status | Evidence |
| ----- | ------ | -------- |
| `EmptyState` hides CTA unless `onActionClick` or `action` provided | PASS | `src/components/common/states.tsx` |
| Source gate: `actionLabel` must pair with handler/action | PASS | `npm run check:empty` (wired into `check:modules`) |
| Bills empty CTA was dead `actionLabel` only | PASS (fixed) | Now uses native `Link` to `/purchases/bills/new` |
| Banking / recurring empty CTAs | PASS | Focus create field / open create dialog |
| Fixture advertises unavailable action without rendering button | PASS | `e2e/ui` “Unavailable action” count 0 |
| Every nested empty/error path audited | PARTIAL | High-traffic samples only this batch |
| Authenticated staging empty/error walkthrough | NOT VERIFIED | Not executed |

**Verdict:** enforcement + one real fix landed; full route-by-route empty/error DoD remains **IN PROGRESS**.
