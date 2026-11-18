# LinkBooks semantic colour system

**Version:** Batch 29 (2026-11-18)  
**Extends:** existing tokens in `src/styles.css` — does not invent a second palette system.  
**Originality:** Colours express **state and purpose**, never competitor trade dress. See [ORIGINALITY_AND_REFERENCE_POLICY.md](./ORIGINALITY_AND_REFERENCE_POLICY.md).

## Meaning map

| Colour family | Token family | Meaning | Examples |
| --- | --- | --- | --- |
| Blue | `primary`, `info-*` | Primary actions, active nav, approved/sent/partial | Save, selected tab, Approved badge |
| Green | `success-*` | Paid, posted success, healthy positive completion | Paid invoice, Posted journal toast |
| Teal | `complete-*` | Reconciled / settled / workflow complete (≠ paid) | Bank reconciled, reimbursed |
| Amber | `warning-*` | Pending, due soon, needs attention | Awaiting approval |
| Red | `destructive-*` | Error, overdue, rejected, destructive | Overdue, Delete |
| Purple | `ai-*` | AI assistance only | AI suggestion badges/panels |
| Neutral | `neutral-*`, muted | Draft, void, inactive, archived | Draft, Voided |

Money direction uses `--money-in` / `--money-out` and must not be collapsed into “good/bad”.

## Hard rules

1. Colour reflects real persisted state or an established nav category — never decoration alone.
2. Pair colour with a label and/or icon (WCAG).
3. Theme presets may recolour brand accent; they must not rewrite status/money semantics.
4. Success toasts only after verified success; failures never show green confirmation.
5. Do not use `Button` `success`/`warning` variants unless the action outcome matches.
6. Nav group icon tints are category cues on inactive items only; active module uses sidebar-active chrome.

## Status mapping source of truth

[`src/lib/status-badge.ts`](../../src/lib/status-badge.ts) + [`StatusBadge`](../../src/components/common/StatusBadge.tsx).

| Status | Tone |
| --- | --- |
| Draft / void / cancelled | neutral |
| Awaiting approval / pending | warning |
| Approved / sent / partly paid / connected | info (blue) |
| Paid / posted / active / healthy | success (green) |
| Reconciled / completed / settled / reimbursed | complete (teal) |
| Overdue / rejected / failed | danger |
| AI suggestion / AI review / validated-for-review | ai (purple) |

Unknown statuses render **neutral + humanised label** — never auto-success.

## Components

| Control | Semantic wiring |
| --- | --- |
| `Button` | `default` primary blue; `destructive`; `success`/`warning` only when outcome matches |
| `StatusBadge` / `badgeVariants` | tone → soft surface + ink |
| Sidebar icons | `data-nav-group` / `data-nav-accent="ai"` |
| Progress / toggles | `MeasuredProgress` (completed/total only); `PersistedSwitch` (save + rollback) |
