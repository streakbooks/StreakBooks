# Firm & Clients — onboarding workload development roadmap

## Four development batches

This is a **new four-batch subproject** following the already merged advanced
onboarding automation from PR #129. It is not a count of every historical
Firm & Clients feature or the whole application's production readiness.

1. **Staff workload and task queues (current batch).** Staff-specific open task
   lists scoped by user permissions, a firm administrator's configurable
   advisory target for open tasks, staff utilization, and live completion
   snapshot for accessible clients. Optimistic versioning and MFA.
2. **Escalations and ownership policies (pending).** Opt-in, firm-configurable
   overdue escalation thresholds. Determine recipients with independent
   client access and role checks; schedule idempotent notifications.
3. **Reporting depth and exports (pending).** Filtered operational CSV reports,
   client/team completion trends, capacity analysis and historical snapshot
   definitions. Prevent CSV formula injection and unauthorized exports.
4. **Release hardening (pending).** Run npm tests, typecheck, lint, build,
   authenticated E2E, two-firm/MFA QA, responsive/keyboard checks and
   staging/production verification. GitHub CI remains disabled by request.

## Principles

- A **coded batch** is counted as complete only when its files are committed
  and merged to `main` and its available SQL integration checks pass.
- **Production readiness** is tracked separately; merged code is **not**
  automatically production verified.
- `firm_onboarding_staff_capacity.max_open_steps` is an **advisory target**,
  not a hard cap on assignments; therefore it never changes client or staff
  access. The workload counts are scoped to the current user's authorized
  client data, and may not represent the entire practice when access differs.
- Existing scheduled onboarding reminders remain unchanged in batch 1.
- New Supabase migrations are forward-only and have committed SQL files.
- GitHub Actions CI must not be triggered by the assistant.

## Local review commands

```powershell
cd D:\MyApp\LinkBooks
git status
if (git status --porcelain) { throw "Save or stash local changes first." }
git switch main
git pull --ff-only origin main
npm.cmd ci
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test -- src/lib/firm/firm-onboarding-workload.test.ts src/lib/firm/firm-onboarding-workload.functions.test.ts
npm.cmd run check:lookups
npm.cmd run build
npm.cmd run dev
```

Open `http://localhost:8080`, then Firm & Clients > Onboarding.
