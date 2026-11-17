# Messages module — Definition of Done

Copy of `docs/engineering/NEW-MODULE-DEFINITION-OF-DONE.md` for Messages.

| # | Gate | Result |
| - | ---- | ------ |
| a | Route + MODULE_REGISTRY + nav | Done on branch |
| b | ListWorkspace / PageHeader / tokens | Done on branch |
| c | Loading / empty / error / forbidden / reconnect | Done (connection health + recovery) |
| d | Real send/list/create (no dummy success) | Done on branch (needs live DB proof) |
| e | RBAC/RLS isolation | SQL + permissions present; live harness pending |
| e1 | Permissions in `permissions.ts` | Done |
| e2 | `role_permissions` seed migration | Done on branch |
| e3 | Access catalogue entries | Done |
| e4 | `check:modules` | Re-run on each batch before merge |
| f | Migration/rollback documented | Done (`ARCHITECTURE.md`, `MIGRATION-INVENTORY.md`, `STAGING-VERIFICATION.md`) |
| g | Honest copy | Done |
| h | Responsive + a11y | Partial (controls labelled; full audit pending) |
| i | Tests + screenshots | Unit suite + gated E2E; screenshots pending |
| j | Originality review | Pending |
| k | Docs under `docs/chat/` | Done on branch (keep current) |
| l | Merge evidence | Pending (draft PR #224) |
