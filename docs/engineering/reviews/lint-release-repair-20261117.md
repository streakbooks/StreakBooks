# Release lint repair

The enforced whole-repository ESLint gate reported 16,809 errors and 10 warnings on the initial POS working tree, dominated by formatting. This isolated release branch applies the existing formatter rules to flagged source/test files and repairs remaining hook/type/control-character issues without disabling any rule.

Targeted semantic/type repairs reuse the already-existing draft #227 implementations for CRM query types, stable hook dependencies, unconditional HR permission hooks, ASCII control validation and NUL stripping. Source: `origin/fix/production-type-contracts` at 694df0e33b5af02bb31d8486a1c1a86672899417. That branch is unchanged. This batch is not a replacement for its migration/CI/deployment work; reviewers must account for the overlapping formatting changes.

Validation so far: whole-repository ESLint passed with zero warnings; 83 focused text/messaging/fixed-asset/reconciliation/CRM tests passed across 25 files. Full typecheck, full unit suite, build and browser regression results are reported by the integration POS branch after consuming this batch. No database migration or production data change is added here. No CI pass or production readiness is claimed.

GitHub CI itself is blocked before all job steps by account billing/spending-limit failure (Actions run 44111433825); no check was disabled to bypass that block.

Windows review: protect local work, fetch, and inspect `origin/fix/lint-release-gate-20261117`. Run `npm.cmd run lint -- --max-warnings=0`. Review the non-formatting changes separately from formatting-only hunks; test HR approvals with differing permission combinations and switching roles, tax filters, onboarding reports, CRM quote links and evidence URL validation in a dedicated test organization. Authenticated staging and full release gates remain pending.
