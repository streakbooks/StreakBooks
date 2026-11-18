# LinkBooks design system

**Version:** 2026-11-18 Batch 25 (density foundation). Extends existing tokens — does not introduce a second design system.

## Foundations

| Layer | Source |
| ----- | ------ |
| CSS tokens | `src/styles.css` (`@theme inline`, semantic money/status, density `--lb-*`) |
| Theme palettes (8 + custom) | `src/lib/theme.ts` |
| Typography | Inter (UI), IBM Plex Mono (tabular money) |
| Primitives | Radix / shadcn under `src/components/ui/*` |
| Product chrome | `AppShell`, `PageHeader`, `ModuleSubnav`, `ListWorkspace`, `RecordWorkspace`, `TransactionWorkspace` |

## Density tokens (Batch 25)

| Token | Target |
| ----- | ------ |
| `--lb-sidebar-width` | 16rem (256px) |
| `--lb-sidebar-width-collapsed` | 4.5rem (72px) |
| `--lb-header-height` | 4rem (64px) |
| `--lb-control-height` | 2.5rem (40px) |
| `--lb-control-height-coarse` | 2.75rem (44px) |
| `--lb-table-row-height` | 2.75rem (44px) |
| `--lb-space-1`…`6` | 4/8/12/16/24/32px |
| `--lb-duration-fast` / `--lb-duration-normal` | 150ms / 200ms |

## Rules

- Brand accent must not replace status, money direction, accounting basis or document lifecycle semantics.
- Unknown statuses render **neutral + humanised label** (`resolveDomainStatus`); never auto-success.
- Honor `prefers-reduced-motion`.
- Coarse pointers: ≥44px interactive height where shared buttons apply.
- Dense financial tables remain scannable; amounts use `.numeric` / `.money`.
- Transaction entry follows [TRANSACTION_WORKSPACE_UX.md](./TRANSACTION_WORKSPACE_UX.md).

## Component inventory (contracts)

| Component | Behaviour contract |
| --------- | ------------------ |
| PageHeader | Title, optional crumbs (native links), one primary action region |
| ModuleSubnav | All sections as native links; scrollable; no hidden essential items |
| ListWorkspace | Header + optional subnav/toolbar/insight rail |
| RecordWorkspace | Header + related + body + timeline + insight rail |
| TransactionWorkspace | Header + details + lines + totals + support + optional sticky actions |
| FormGrid / FormField | Compact transaction header fields |
| EditableLineItemGrid | Sticky header line table chrome + add-row |
| TotalsSummary | Presentational subtotal/tax/total strip (engine-supplied values) |
| SplitButton | Primary action + overflow menu for Save variants |
| StatusBadge | Label + icon + tone from persisted status only |
| DataTableToolbar | Search, columns, density, export feedback, selection bar |

Live demonstrations stay inside the product / developer sandbox — no separate marketing site.

## Themes

Eight named palettes + custom; light/dark/system independent. Persistence is browser-local today (`linkbooks-theme*` keys); per-user/company sync remains a later verified batch. Theme changes must not alter semantic financial status colours.
