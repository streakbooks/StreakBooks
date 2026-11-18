# LinkBooks Transaction Workspace UX Contract

**Version:** Batch 42 (2026-11-18)  
**Originality:** See [ORIGINALITY_AND_REFERENCE_POLICY.md](./ORIGINALITY_AND_REFERENCE_POLICY.md). Competitor screens (invoice, quote, bill, PO, receive/spend money, journal) are **usability references only** — never visual templates.

## LinkBooks composition (original)

```
AppShell (navy sidebar) → ModuleSubnav → TransactionWorkspace
  [ Breadcrumbs as native Links ]
  [ Title ] [ StatusBadge ] ........ [ SplitButton Save ] [ Primary post/approve ] [ More ]
  [ FormGrid: contact · dates · reference · currency · tax treatment ]
  [ EditableLineItemGrid — sticky header · Lucide row actions · Add line ]
  [ TotalsSummary bottom-right — engine values, tabular mono ]
  [ Support panels: Notes / History / Attachments / Related ]
  [ Sticky action bar using LinkBooks primary/outline buttons ]
```

This composition is **sidebar-first**, token-driven, and distinct from top-nav / boxed-card competitor shells.

## Capability principles (not visual copying)

| Principle | LinkBooks implementation |
| --- | --- |
| Full-page entry | Authenticated routes + `TransactionWorkspace` |
| Reachable actions while scrolling | `stickyActions` slot — LinkBooks Button / SplitButton only |
| Dense header fields | `FormGrid` + `FormControlShell` (`lb-field-contact` 280–420px, `lb-field-date` ≤180px, `lb-field-money`/`lb-field-currency`) + existing lookups |
| Spreadsheet lines | `EditableLineItemGrid` + domain cell editors on **every New/+ transaction route** (sales, purchases, journals, credits, POs, claims); **2 default empty rows** (`DEFAULT_DOCUMENT_LINE_ROWS`) with Add line; **`width: 100%` + `table-layout: fixed`**; **one fluid column** (Description / Item) absorbs leftover width via `lineGridColumnStyle` — no abandoned right-side blank; fixed numeric/account columns stay compact; **resize handles**; **Columns** beside Add line; quiet cell chrome; **wrap text** on description cells (`lb-spreadsheet-wrap` / `VoiceTextarea`, compact `rows={1}`) |
| Space utilisation | Unexplained gap between line table and its scroll container ≤ **24px** at ≥1280px (Playwright density fixture). Sticky save bar spans the content column (sidebar-aware), full-width, actions right-aligned. Compact price-list selector + disclosure help (no oversized instructional card). |
| Clear totals | `TotalsSummary` vertical stack bottom-right under the grid (subtotal → tax → total; no animated money) |
| Single-page entry | `TransactionWorkspace` for New screens opened from Create menu, module subnav, and list “New” actions — header fields + grid + bottom tax on one page (no separate input tab/block) |
| Full-page Create | Create menu **navigates** to document routes (invoice, bill, quote, PO, …) with browser history — not a half-screen Sheet. Compact `--lb-control-height` (2.25rem / 36px) + intelligent field widths keep Supplier / Customer / dates / price list controls dense at 100% zoom |
| Supporting context | Existing `DocumentRecordPanel` / attachments / notes |
| Browser-like | TanStack `Link`, URL search state, return context |

## Visual differentiation checklist

- No competitor green/purple as default action colours
- No status “chevron ribbon” motifs from third-party ERPs
- No field leading-icon clusters that reproduce a competitor form look
- No boxed “floating card on grey canvas” as the only composition when AppShell already provides the workspace
- Tracking / class / location columns use LinkBooks dimension labels — never mimic a third-party custom column brand name

## Component mapping

| Slot | Component |
| --- | --- |
| Shell | `TransactionWorkspace` |
| Fields | `FormGrid` + `FormControlShell` + `FormField` |
| Lines | `EditableLineItemGrid` |
| Totals | `TotalsSummary` |
| Save menu | `SplitButton` |
| Attachments / notes | existing document panels |
| Insights | `WorkspaceInsights` |

## Out of scope for visual batches

Posting math, tax engines, period locks, RLS, approval rules — call existing services unchanged.
