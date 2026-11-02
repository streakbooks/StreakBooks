# Control centre report

Date: 2 November 2026. Branch `chore/superadmin-continue`. Pull request: https://github.com/rohitmehra86/LinkBooks/pull/66. This is the author’s report. A second person has not reviewed it.

## Originality

The work extends the existing platform permissions, `platform_log`, entitlements, `get_entitlements`, `ledger_health_check`, and `platform_export`. Contact tags, billing plans, and posting are unchanged. `is_demo` does not change the ledger checks. No second billing, plan, or export system was added.

## Defect register

| Item | State |
| --- | --- |
| Hosted migrations `20261102170000` through `20261102330000`, plus the start-month backfill | READY-TO-APPLY. Not applied. Needs `BACKUP CONFIRMED` in `docs/HANDOFF.md`. |
| Payment provider calls, usage posting, reconciliation | Blocked. No test-mode secret in `.env.local`. |
| Live second-approver walkthrough | Blocked. Needs a second platform user with `approvals.manage`. |
| Local platform owner and migration-history replay | Blocked. Docker is not installed. LeadOrbit is not a LinkBooks staging database. |
| Playwright grant and revoke | Skipped. Public quote tests passed, 2. |
| Audit hash | Detects one edited row. Rewriting every later row still verifies. |
| Jobs, config promotion, sandbox requests | The recorded decision does not execute a job, copy settings, or create a company. |
| Webhook deliveries | The list exists. No writer inserts delivery rows yet. |
| AI spend | A missing unit price stays null. The read was not applied. |
| Full unit suite | Last full run was 163 files and 1279 tests, before the later platform files. Each later file was run on its own. |

## Not done

Do not apply the hosted project. Do not merge pull request 66 until `verify` and `voice-browser` are green and a second person has read this report.
