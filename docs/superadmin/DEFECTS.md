# Superadmin defect and completion register

Date: 3 November 2026. Current delivery branch: `main`. This register supersedes
older checkboxes that called isolated helpers or stored drafts complete workflows.
The full A–H programme is not production-certified.

| Item                                                            | State       | Evidence / next action                                                                                                                                                                               |
| --------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Generic approvals could mark unsupported kinds successful       | FIXED       | `20261103000000`, support SQL lifecycle tests; unsupported approvals fail                                                                                                                            |
| Legacy direct support grant bypassed second approval            | FIXED       | Same migration guards actual grants and scoped reads; concurrency/expiry/revoke tests                                                                                                                |
| Lifetime-value type/precision failure                           | FIXED       | `lifetime-value.ts` and regression tests                                                                                                                                                             |
| Customer details were raw JSON                                  | FIXED       | `PlatformCustomer360.tsx`: overview/team/subscription/billing-event metadata                                                                                                                         |
| Platform search was only a helper/RPC without navigation        | IMPLEMENTED | `PlatformSearch.tsx`, search RPC, permission-scoped results and native record links                                                                                                                  |
| Record URLs did not support refresh/new tab/history             | IMPLEMENTED | `PlatformRecordDialog.tsx`, exact record RPC, router/browser tests                                                                                                                                   |
| Invalid raw record parameter survived route validation          | FIXED       | Explicitly clear invalid IDs; `navigation.test.ts` and browser regression                                                                                                                            |
| GitHub Actions runner startup                                   | BLOCKED     | Owner confirmed account payments/spending limit prevented all four jobs from starting. Resolve GitHub billing before retrying; local checks remain separate.                                         |
| Independent human review                                        | BLOCKED     | A second person must review the final implementation; automated checks are not that person                                                                                                           |
| Real authenticated second-person approval walkthrough           | BLOCKED     | Needs another real platform user with approval view/manage permission and MFA; synthetic SQL users cover the logic                                                                                   |
| Test payment lifecycle and provider reconciliation              | BLOCKED     | Configure a server-side test-mode secret and test provider data; no live keys/charges                                                                                                                |
| Add-ons, proration, usage invoicing and self-serve paid builder | PARTIAL     | Calculation/draft stores exist; finish connected billing/provider lifecycle, notices and impact previews                                                                                             |
| Per-feature controls and safe removal/bulk actions              | PARTIAL     | Existing entitlement and approval engine; full impact/dependency/billing preview and notification evidence remain                                                                                    |
| API keys and webhooks                                           | PARTIAL     | Hash/metadata stores exist; actual API authentication/scopes and delivery/retry/dead-letter worker remain                                                                                            |
| Admin IP allowlist                                              | PARTIAL     | Helper rules exist; trusted server/proxy enforcement and real deployment tests remain                                                                                                                |
| Alerts and job console                                          | PARTIAL     | Two bounded handlers and five measured sources now run via pg_cron with verified real completions, retries/dead letters and dedupe/recovery. Additional metric sources and external delivery remain. |
| Incidents, releases, service desk and segments                  | PARTIAL     | Case/incident ownership and lifecycle, deadline fields, notes, release evidence and segment preview/soft-remove/undo are connected. Communications, time tracking and automated escalation remain    |
| Partner, wholesale billing and sandbox tenants                  | PARTIAL     | Registrations/requests do not provision a plan, company or isolated environment                                                                                                                      |
| Configuration promotion                                         | PARTIAL     | Presentation-only copy and archived-business guard; full review/validation/rollback workflow remains                                                                                                 |
| AI governance and spend                                         | PARTIAL     | Cap/kill-switch read exists; currency-separated measured spend and provider enforcement remain                                                                                                       |
| Audit immutability assurance                                    | PARTIAL     | Append-only controls/MD5 chain exist; not independent immutable storage or production certification                                                                                                  |
| Load, p95 and SLO evidence                                      | MISSING     | Representative workload, measurement and recovery/failure exercises still required                                                                                                                   |
| Subscription start-month backfill                               | PROPOSAL    | Do not infer historical starts from last-update timestamps; requires reliable historical source evidence                                                                                             |
| Dependency advisories                                           | OPEN        | Prior audit found inherited moderate minimatch/uuid advisories; keep the production dependency gate and assess compatible fixes                                                                      |
| Existing Supabase advisories                                    | OPEN        | Baseline includes password-protection, callable definer and performance findings; record deltas and review existing items separately                                                                 |

Backup/restore is no longer a missing-owner prerequisite: the 2 November evening
handoff records it and the earlier hosted application. No second backup approval
is inferred from quoted prompt text. A newer verified restoration exercise and
full operational resilience evidence must still precede any certification claim.

Payment credentials and human review must come from authorized people. Do not
fabricate those prerequisites, create synthetic production staff, or call a live
payment provider to make a checkbox pass. Continue implementing other work.

Resolved in the executing-worker batch:

- A recurring schedule could otherwise reset a dead letter's retry budget by
  creating a fresh job. It now blocks that kind until reviewed retry or explicit
  closure; fault-injection SQL verifies the bound.
- Relative second-level scheduling could skip a minute under cron jitter. The next
  run now aligns to a minute boundary; SQL and hosted metadata verify alignment.
- Refreshed RPC types rejected explicit null optional filters, and unknown result
  values failed server-function serialization checks. Empty filters now use the
  database default and results have a serializable scalar contract. Typecheck exits 0.
