# LinkBooks CRM — Design originality review checklist

**Policy:** Competitors are functional/usability benchmarks only. Do not copy proprietary UI, branding, layouts, illustrations, icons, distinctive interactions or source.

**Design system of record:** `docs/premium-ui/LINKBOOKS_DESIGN_SYSTEM.md`  
**Chrome:** `ListWorkspace` / `RecordWorkspace` / `PageHeader` / existing theme tokens (8+ presets).

## Per-screen checklist (required before enabling a CRM surface)

| # | Check | Result |
| - | ----- | ------ |
| 1 | Visual design developed from LinkBooks tokens/workspaces, not a competitor skin | |
| 2 | No distinctive Salesforce Lightning / HubSpot / Pipedrive / Odoo / Dynamics chrome copied | |
| 3 | Typography, spacing, status colours follow LinkBooks semantic tokens | |
| 4 | Icons from approved licensed set (Lucide in-repo) | |
| 5 | Fonts remain LinkBooks stack (Inter UI, IBM Plex Mono tabular) | |
| 6 | Kanban/tables use LinkBooks borders/surfaces — not competitor pipeline chrome | |
| 7 | Animations honor `prefers-reduced-motion` | |
| 8 | Asset/dependency licenses reviewed for new packages | |
| 9 | Future CRM screens inherit MODULE_REGISTRY experience contract | |
| 10 | Legal IP review not falsely claimed complete | Pending legal |

## Foundation batch (CRM-02/03/05 screens) — self review

| Screen | Originality |
| --- | --- |
| Overview KPI grid | LinkBooks cards + alerts; forecast disclaimer |
| Leads list/form | ListWorkspace + shared table/inputs |
| Lead detail | RecordWorkspace |
| Opportunities board | LinkBooks muted columns + Select move (not DnD clone) |
| Pipelines | Card stage lists |
| Activities | Shared table/forms |
| Settings | Switch + fields in Card |
| Deferred sections | Honest EmptyState |

**Verdict:** Reviewed for originality against LinkBooks design language. **Not** a substitute for formal legal review.

## Sign-off

- Engineering originality self-check: **Reviewed** (this document)
- Legal / IP counsel: **Pending**