# CRM formal E2E pack (5/5)

**Purpose:** Acceptance cases from CRM-PRD / master directive. Automated contracts live in `src/lib/crm/e2e-pack.test.ts`. Live authenticated browser proof is still required separately.

| ID | Case | Live status | Automated contract |
| --- | --- | --- | --- |
| lead-create-persists | Create lead persists | Unverified live | Pack + lead validation paths |
| lead-assign-member | Assign to org member | Unverified live | Team workload + assign RPC exists |
| opportunity-stage-move | Stage change with version | Unverified live | Forecast open-only weighting |
| lead-convert-match | Convert with match selection | Unverified live | Gap convert/match RPCs shipped |
| unauthorized-denied | Unauthorized denied | Unverified live | Comms/automation/import/territory fail-closed |

## How to run automated contracts

```powershell
cd D:\MyApp\StreakBooks
npx vitest run src/lib/crm/e2e-pack.test.ts
```

## Live checklist (authenticated Demo Company)

1. Enable CRM → create lead → refresh list → lead remains.
2. Assign lead to another active member → owner updates; non-member rejected.
3. Move opportunity stage on board (select or drag) → history/version conflict handled.
4. Convert lead with matching contact → must select existing; no silent duplicate.
5. User without `crm.view` sees No CRM access; send/automation/import/territory actions stay disabled.
