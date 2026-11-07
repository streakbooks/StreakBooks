# EM-03 — Claims, lines, splits and templates

**Result:** Partially completed locally — multi-line drafts, equal-split UI, templates, duplicate, submit/withdraw/delete verified with unit tests. Kanban, print/export and dimension-heavy allocation UI remain.

## Completed

- EM-03a: draft lifecycle RPCs and My Expenses / All Claims lists.
- EM-03b: pure split helpers (`amount` / `percentage` / `equal`) with tax remainder allocation.
- Multi-line claim editor on My Expenses.
- Equal split across two accounts in the UI (amount/percentage helpers covered by unit tests).
- Templates table + list/save/delete RPCs; save-as-template and load-template in UI.
- Duplicate claim as new draft RPC + UI action.
- Migration `20261107130000_expense_management_templates_duplicate.sql`.

## Remaining limitations

- Kanban board not built.
- Claim print/PDF export not built.
- Split UI currently exposes equal two-account split only.
- Line-level department/project/customer allocation pickers not yet in the editor.
- Migrations not applied; browser E2E not run.
