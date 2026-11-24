# Fixed Assets — Batch 4: Responsive UI / UX (2026-11-06)

Status: **source committed to draft PR #111; unmerged, not deployed and unverified**. No database migrations or accounting posting changes.

## Changes delivered in source

### Fixed asset register
- Responsive mobile asset cards on phone viewports, retaining the full desktop table at `md` and above.
- Each card exposes identity, effective status, acquisition date, depreciation method, original cost, authoritative as-at accumulated depreciation, as-at book value (only when known), last posted depreciation date and the same guarded actions as the desktop.
- Actions share the same permissions and posting checks on both sizes; disposal is disabled for future acquisitions; deletion stays disabled for posted-depreciation/disposed assets.
- Unknown financial balances remain unavailable rather than populated with estimated figures.
- The five Fixed Assets section tabs remain **native links** (modified/middle click and open in new browser tab) and now scroll horizontally on narrow displays instead of wrapping into multiple rows.

### Asset details workspace
- Read-only responsive dialog with an independently scrollable content region and visible title/Close controls.
- Three inner sections: **Overview**, **Depreciation schedule**, **Posted journals**.
- Four compact summary items: original cost, recorded posted charges, opening plus posted accumulated depreciation, and cost less recorded depreciation for active assets. Disposed assets show disposal date instead of an incorrect current book value.
- Summary maths uses bigint and rejects unsafe numbers, negative charges and over-depreciation. It is presentation-only, **not** a substitute for the posted general ledger or complete disposal accounting.
- Overview includes account mappings, date/method terms, notes, source bill and disposal-journal navigation. Posted journal and projected schedule lists retain separate 12-row pagers.
- No pretend Files, maintenance or complete audit-history screens: those require verified backend integrations.

### Asset entry form
- Grouped **Asset identity**, **Depreciation policy** and **Account mapping** areas.
- Inline validation for name, real calendar dates, depreciation start order, cost, residual, opening depreciation, useful life, annual rate, required GL accounts and cost-vs-accumulated account conflict.
- Mirrors existing depreciation validation; **SQL/RPC validation remains authoritative**. Frozen financial-terms mode continues to allow descriptive edits without financial-field requirements.
- Save disabled during mutation or while invalid, with server errors displayed inline in addition to toast feedback. Notes counter shows 4,000-character limit and non-financial note examples.

## New regression cases
- `src/lib/fixed-assets/asset-detail-summary.test.ts`: posted-charge summaries, disposal state, exact large-number strings, unsafe numbers, over-depreciation, input immutability.
- `src/lib/fixed-assets/asset-form-feedback.test.ts`: valid forms, missing fields, calendar dates, conflicting GL accounts, reducing-balance rates, residual/opening limits, descriptive-only edits and precision errors.

## Local verification required before merge

No GitHub Actions or CI should be triggered by this work. After safeguarding any unfinished local Cursor edits:

```powershell
cd D:\MyApp\StreakBooks
git status
git fetch origin
git switch feature/fixed-assets-register-safety-ux-20261106
git pull --ff-only origin feature/fixed-assets-register-safety-ux-20261106
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test -- src/lib/fixed-assets/
npm.cmd run check:ui
npm.cmd run check:lookups
npm.cmd run check:navigation
npm.cmd run build
npm.cmd run dev
```

Use `git switch --track origin/feature/fixed-assets-register-safety-ux-20261106` for first local checkout if needed. Check `git status` first; do not discard or overwrite local uncommitted changes.

Manual responsive QA: 320/375/390px phone, 768px tablet, 1280px desktop; cards/table, long asset names, large amounts, future/disposed statuses, horizontal tabs, keyboard Arrow/Home/End, native modified clicks, details dialog scroll and focus trap, close focus restoration, source-bill/journal links, separate history pagers, frozen edits, invalid field validation, save failures and cross-tenant permissions.

## Remaining UI and product work
- Actual browser/device accessibility validation, including keyboard focus and screen readers.
- Server-side paging at large asset counts; configurable desktop columns and saved register views.
- Full audit timeline and attachments on fixed assets once backend availability and secure access are verified.
- Exception ownership/sign-off for GL reconciliation; depreciation-run confirmation UX; interactive visual register analytics.
- Build, lint, unit/integration, authenticated RLS/browser, staging and FX parity verification have **not run** in this session.

**Release decision:** keep PR #111 in draft until tests pass, branch is updated against current main and the review is approved.
