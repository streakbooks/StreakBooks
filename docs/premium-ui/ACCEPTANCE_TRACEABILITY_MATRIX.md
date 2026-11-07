# Acceptance traceability matrix

A route is never marked complete without audit evidence. Batch 1 establishes architecture only.

| Requirement area | Routes / modules | Source | Tests | Browser QA | Status |
| ---------------- | ---------------- | ------ | ----- | ---------- | ------ |
| ModuleDefinition registry | 24 sidebar + hidden | `src/lib/modules/*` | `registry.test.ts`, `check:modules` | n/a | partial |
| Scaffold CLI | future modules | `scripts/scaffold-module.mjs` | dry-run + unit | n/a | partial |
| List/Record workspace chrome | authenticated routes/screens + shared shells | `src/components/workspace/*` | `check:ui`, `check:modules` PageHeader bypass | not-yet-verified live | in-progress |
| Direct PageHeader on screens/routes | forbidden | `check:modules` | local pass Batch 9 | n/a | in-progress |
| Status unmapped fallback | global | `status-semantics.ts` | unit | not-yet-verified | partial |
| Native navigation | all nav | existing scripts | `check:navigation` | partial historical | partial |
| Section 14 finished-screen DoD | every module | screens/* | various | not-yet-verified | partial |
| Section 20 future inheritance | scaffold + checks | scripts + AGENTS.md | unit + check:modules | architecture verified | partial |

Route-level workspace adoption completed through Batch 8–9. Per-screen Section 14 acceptance (actions, permissions, a11y, posting integrity) remains module-by-module and is **not** claimed DONE.
