# Messaging module — Definition of Done

| # | Gate | Result |
| - | ---- | ------ |
| a | Route coverage: `/messages`, settings, registry | PASS |
| b | Visual/UX: `ListWorkspace` / shared tokens | PASS |
| c | State variants: loading/empty/error/disabled | PASS |
| d | Real backends (no dummy post/pay/approve) | PASS — formal approval handoff only |
| e | RBAC/RLS isolation | PASS structural; live dual-browser E2E remaining |
| e1 | Permissions in `permissions.ts` | PASS |
| e2 | `role_permissions` seeded in migrations | PASS |
| e3 | Access catalogue | PASS |
| e4 | `check:modules` | PASS |
| f | Migration/rollback documented | PASS — see `MIGRATION-INVENTORY.md`, `PRODUCTION-READINESS.md` |
| g | Honest loading/errors/empty | PASS |
| h | Keyboard/a11y basics | PASS (labels, Escape, aria-live) |
| i | Tests + gated E2E scaffolds | PASS unit; live E2E gated |
| j | Originality | PASS |
| k | Docs updated | PASS |
| l | Merge evidence | PASS — PR #224 on main; follow-up hardening PR |

**Fail-closed:** customer/vendor portal messaging locked until env unlock + isolation E2E.
