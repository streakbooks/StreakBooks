# LinkBooks Transaction Workspace UX Contract

**Version:** Batch 25 (2026-11-18)  
**Originality:** LinkBooks design language. Competitor screenshots are usability references only — do not copy branding, distinctive layouts, icons, or assets.

## Layout

```
[ Breadcrumbs ]
[ Title + number ] [ StatusBadge ] ............ [ Save split ] [ Approve ] [ More ]
[ Details FormGrid: Contact | Date | Due | Reference | Currency/Tax | … ]
[ EditableLineItemGrid — sticky header, inline cells, add row ]
[ ........................ TotalsSummary (subtotal, tax, total) ]
[ Support: Notes | Attachments | History | Related ]
[ Sticky action bar when scrolling ]
```

## Principles

1. Full-page create/edit for primary documents (invoice, bill, journal, money docs).
2. Sticky primary actions remain reachable on long line tables.
3. Compact 3–4 column header fields with muted labels.
4. Spreadsheet-like lines: Item, Description, Qty, Price, Account, Tax, Amount.
5. Totals bottom-right; values from the calculation engine only — never animate misleading intermediate totals.
6. Support content in tabs/panels under the fold.
7. Semantic LinkBooks status colours; preserve 8+ theme presets.
8. Native TanStack Router links; preserve list return context.
9. Drawers/dialogs for secondary edits only.
10. Fail closed: no dummy Save/Approve/Post.

## Component mapping

| Slot | Component |
| --- | --- |
| Shell | `TransactionWorkspace` |
| Fields | `FormGrid` + `FormField` |
| Lines | `EditableLineItemGrid` (+ domain cell editors) |
| Totals | `TotalsSummary` |
| Save menu | `SplitButton` |
| Attachments | existing `AttachmentsPanel` |
| Insights | `WorkspaceInsights` |

## Out of scope for visual batches

Posting math, tax engines, period locks, RLS, approval rules — call existing services unchanged.
