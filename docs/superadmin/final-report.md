# Control centre report

Date: 2 November 2026. Branch `chore/superadmin-continue`. Pull request: https://github.com/rohitmehra86/LinkBooks/pull/66. This is the author’s report. A second person has not reviewed it.

## Originality

The work extends the existing platform permissions, `platform_log`, entitlements, `get_entitlements`, `ledger_health_check`, and `platform_export`. Contact tags, billing plans, and posting are unchanged. `is_demo` does not change the ledger checks. No second billing, plan, or export system was added.

## Defect register

| Item | State |
| --- | --- |
| Hosted migrations `20261102170000` through `20261102480000`, plus the start-month backfill | READY-TO-APPLY. Not applied. Needs `BACKUP CONFIRMED` in `docs/HANDOFF.md`. |
| Payment provider calls, usage posting, reconciliation | Blocked. No test-mode secret in `.env.local`. |
| Live second-approver walkthrough | Blocked. Needs a second platform user with `approvals.manage`. |
| Local platform owner and migration-history replay | Blocked. Docker is not installed. LeadOrbit is not a LinkBooks staging database. |
| Playwright grant and revoke | Skipped. Public quote tests passed, 2. |
| Audit hash | Detects one edited row. Rewriting every later row still verifies. |
| Jobs, config promotion, sandbox requests | A job is queued and not executed. A sandbox request does not create a company. Promotion copies locale, date format, footer, and theme colour only after a second approval (`20261102380000`). A request names two businesses that exist (`20261102440000`). Neither migration is applied. |
| Webhook deliveries | `20261102350000` can record an outcome and is not applied. `20261102470000` keeps the previous status when that outcome changes. The live handler does not call either function. |
| AI spend | A missing unit price stays null. The read was not applied. |
| Full unit suite | 192 files, 1349 tests, all passed, after the platform files. Typecheck then failed on `audit-chain.ts` index access and that error is fixed in the following commit. |

## Not done

Do not apply the hosted project. Do not merge pull request 66 until `verify` and `voice-browser` are green and a second person has read this report.
