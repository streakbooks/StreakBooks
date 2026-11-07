# Acceptance traceability matrix

A route is never marked complete without audit evidence. Batch 1 establishes architecture only.

| Requirement area | Routes / modules | Source | Tests | Browser QA | Status |
| ---------------- | ---------------- | ------ | ----- | ---------- | ------ |
| ModuleDefinition registry | 24 sidebar + hidden | `src/lib/modules/*` | `registry.test.ts`, `check:modules` | n/a | partial |
| Scaffold CLI | future modules | `scripts/scaffold-module.mjs` | dry-run in Batch 1 | n/a | partial |
| List/Record workspace chrome | all future list/record | `src/components/workspace/*` | typecheck | not-yet-verified | partial |
| Status unmapped fallback | global | `status-semantics.ts` | unit | not-yet-verified | partial |
| Native navigation | all nav | existing scripts | `check:navigation` | partial historical | partial |
| Banking…Help finished-screen DoD | each module | screens/* | various | not-yet-verified for full DoD | not-started → partial |
| Section 20 example module inheritance | temporary scaffold | scripts | dry-run | pending screenshot | partial |

Full per-screen Section 14 checklist will be filled module-by-module in Waves 3–6.
