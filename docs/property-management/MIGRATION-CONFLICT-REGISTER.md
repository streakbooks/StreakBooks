# Migration conflict register

| ID | Risk | Mitigation | Status |
| --- | --- | --- | --- |
| MC-01 | Timestamp collision with concurrent feature migrations | Use timestamps after latest main migration (`20261118140000+`); never reuse | Open |
| MC-02 | Permission key collisions (`property.*`) | Namespace reserved for PM; document in permissions catalogue | Open |
| MC-03 | Tracking option “Property” conflicting with projects/classes | Prefer PM-owned FKs + optional tracking link; do not hijack project_id | Open |
| MC-04 | Contact kind expansion for owners/tenants | Reuse contacts without new conflicting identity tables; `pm_owners` / `pm_tenants` are role overlays | Open |
| MC-05 | Premium-ui / advisors branches diverge from main | Branch from latest `main` only; do not merge unrelated feature branches | Open |
| MC-06 | Auto-generated `routeTree.gen.ts` churn | Regenerate via Vite/router tooling; avoid manual edits | Open |
| MC-07 | Staging/prod migration apply without approval | Committed SQL ≠ applied; require explicit gate | Blocked until approved |
| MC-08 | Demo seed pollution of PM financials | Demo Company may seed master data only; no fake posted journals for demo KPIs | Open |

Update this register whenever a new concurrent PR touches accounting, contacts, permissions, App Store or portals.
