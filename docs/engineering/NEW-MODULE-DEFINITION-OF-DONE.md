# New Module Definition of Done

All newly added routes/modules are subject to the LinkBooks premium design and functional acceptance contract (master prompt Section 20). Copy this checklist into every feature PR that adds a module, submenu, nested route, portal page, settings panel, dialog, drawer, wizard or report screen.

| # | Gate | Result (PASS / N/A + reason / BLOCKED) |
| - | ---- | ---------------------------------------- |
| a | Route coverage: registered in router, inventory and `MODULE_REGISTRY` | |
| b | Visual/UX: `AppShell` (if authenticated), `PageHeader` / `ListWorkspace` / `RecordWorkspace`, tokens, themes | |
| c | State variants: loading, empty, error, forbidden, offline/partial as applicable | |
| d | Real action/back-end contract: no dummy posting/pay/approve controls | |
| e | RBAC/RLS and cross-company isolation verified (deny paths included) | |
| f | Migration/rollback documented when schema changes | |
| g | Loading/errors/empty copy is honest | |
| h | Responsive + accessibility (keyboard, focus, labels, contrast, targets) | |
| i | Tests + screenshots for the new surface | |
| j | Originality/license review for new assets | |
| k | Docs updated (`docs/premium-ui/*`, module README) | |
| l | Merge evidence (PR/commit on authoritative `main`) | |

**Fail closed:** scaffolded create/post/pay buttons remain disabled until (d) and (e) pass.

**Commands:**

```powershell
npm.cmd run check:modules
npm.cmd run check:ui
npm.cmd run check:navigation
npm.cmd run typecheck
```
