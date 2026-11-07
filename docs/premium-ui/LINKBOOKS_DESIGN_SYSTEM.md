# LinkBooks design system

**Version:** 2026-11-07 Batch 1 (foundation). Extends existing tokens — does not introduce a second design system.

## Foundations

| Layer | Source |
| ----- | ------ |
| CSS tokens | `src/styles.css` (`@theme inline`, semantic money/status) |
| Theme palettes (8 + custom) | `src/lib/theme.ts` |
| Typography | Inter (UI), IBM Plex Mono (tabular money) |
| Primitives | Radix / shadcn under `src/components/ui/*` |
| Product chrome | `AppShell`, `PageHeader`, `ModuleSubnav`, `ListWorkspace`, `RecordWorkspace` |

## Rules

- Brand accent must not replace status, money direction, accounting basis or document lifecycle semantics.
- Unknown statuses render **neutral + humanised label** (`resolveDomainStatus`); never auto-success.
- Honor `prefers-reduced-motion`.
- Coarse pointers: ≥44px interactive height where shared buttons apply.
- Dense financial tables remain scannable; amounts use `.numeric` / `.money`.

## Component inventory (contracts)

| Component | Behaviour contract |
| --------- | ------------------ |
| PageHeader | Title, optional crumbs (native links), one primary action region |
| ModuleSubnav | All sections as native links; scrollable; no hidden essential items |
| ListWorkspace | Header + optional subnav/toolbar/insight rail |
| RecordWorkspace | Header + related + body + timeline + insight rail |
| StatusBadge | Label + icon + tone from persisted status only |
| DataTableToolbar | Search, columns, density, export feedback, selection bar |

Live demonstrations stay inside the product / developer sandbox — no separate marketing site.

## Themes

Eight named palettes + custom; light/dark/system independent. Persistence is browser-local today (`linkbooks-theme*` keys); per-user/company sync remains a later verified batch.
