# LinkBooks Transaction Workspace UX Contract

**Version:** Batch 36 (2026-11-18)  
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
| Dense header fields | `FormGrid` + existing lookups |
| Spreadsheet lines | `EditableLineItemGrid` + domain cell editors on **every New/+ transaction route** (sales, purchases, journals, credits, POs, claims); **≥5 empty rows** (`DEFAULT_DOCUMENT_LINE_ROWS`); **fixed column widths** (no autofit); **resize handles**; **Columns** menu where optional fields exist; quiet cell chrome; **wrap text** on description cells (`lb-spreadsheet-wrap` / `VoiceTextarea`) |
| Clear totals | `TotalsSummary` vertical stack bottom-right under the grid (subtotal → tax → total; no animated money) |
| Single-page entry | `TransactionWorkspace` for New screens opened from Create menu, module subnav, and list “New” actions — header fields + grid + bottom tax on one page (no separate input tab/block) |
| Full-page Create | Create menu **navigates** to document routes (invoice, bill, quote, PO, …) with browser history — not a half-screen Sheet. Compact `--lb-control-height` (2.25rem) keeps Customer / dates / price list controls dense |
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
| Fields | `FormGrid` + `FormField` |
| Lines | `EditableLineItemGrid` |
| Totals | `TotalsSummary` |
| Save menu | `SplitButton` |
| Attachments / notes | existing document panels |
| Insights | `WorkspaceInsights` |

## Out of scope for visual batches

Posting math, tax engines, period locks, RLS, approval rules — call existing services unchanged.
