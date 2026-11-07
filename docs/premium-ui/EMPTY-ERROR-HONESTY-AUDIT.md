# Empty / error honesty audit

Labels: `PASS` | `PARTIAL` | `FAIL` | `N/A` | `NOT VERIFIED`.

| Check | Status | Evidence |
| ----- | ------ | -------- |
| `EmptyState` hides CTA unless `onActionClick` or `action` provided | PASS | `src/components/common/states.tsx` |
| Source gate: `actionLabel` must pair with handler/action | PASS | `npm run check:empty` |
| Source gate: `ErrorState` must expose `onRetry`/`retry` (or `data-error-static`) | PASS | `npm run check:error-retry` (Batch 21; 196 files) |
| Bills empty CTA was dead `actionLabel` only | PASS | Native `Link` to `/purchases/bills/new` |
| Banking / recurring empty CTAs | PASS | Focus create field / open create dialog |
| Fixture advertises unavailable action without rendering button | PASS | `e2e/ui` “Unavailable action” count 0 |
| EM / firm / PO / deferrals / contact timeline / sales order options retries | PASS | Batch 21 fixes |
| Authenticated staging empty/error walkthrough | NOT VERIFIED | Authorized; `E2E_*` unset |

**Verdict:** local empty/error honesty gates **PASS**. Staging walkthrough remains open.
