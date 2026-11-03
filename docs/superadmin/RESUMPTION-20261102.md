# Superadmin continuation review — 2 November 2026

PR #66 retains all Cursor commits through `3ace577`. Latest main `c672888` was merged
into this branch without rewriting published history. Nothing from this continuation
was merged to main or applied to the hosted database.

## Findings and disposition

| Finding | Severity | Disposition |
| --- | --- | --- |
| Typecheck fails: lifetime value can return a null currency in the stored variant | Release blocker | Fixed; nonempty payment currency is narrowed |
| Minor-unit totals can silently exceed JavaScript safe integer precision | High | Reject unsafe inputs and total overflow; regression test |
| Generic approval marks price/refund/role approved without an executable effect | High | Refuse unsupported approval kinds; rejection remains available |
| Legacy direct support grant bypasses second-person approval | High | Guard actual grant table and require linked approved request for reads |
| Break-glass decision needs only support permission | High | Require approvals.manage and a separate requester/decider |
| Pending-only unique index does not serialize request/approval state transitions | High | Company-row lock in request, decision, close; actual concurrent-session tests |
| Unbounded/nullable expiry, expired or incompatible legacy requests block the business | High | Database TTL bound, null rejection, audited expiry cleanup; close legacy requests without erasing history |
| Separate break-glass rows do not enable or revoke actual diagnostic grants | High | Connect them to the existing approval inbox and support grants |
| Customer details are raw JSON, not a usable account view | Usability | Overview, team, subscription and billing activity tabs; stored metadata only |
| Approval-view permission shows feature mutation form | Usability/security mirror | Render form only with features.manage; SQL remains authoritative |
| Platform context failure renders blank | Usability | Loading, error and retry states |
| Static authorization test excludes migrations 50–61 | Test gap | Include all 43 pending files and new migration; runtime SQL suite added |
| Master execution prompt missing from repository | Handoff | Restored exact upload |
| Published migration identifiers have invalid wall-clock hours | Deployment blocker | Preserve history; document ordering, require full migration-history reconciliation |

## What is actually connected

- Businesses → Details opens Customer 360 using the existing, permission-checked
  `platform_details` RPC. Team is capped at 100 and billing events at 50; labels do
  not claim those are complete totals. Missing subscription and billing permission
  have explicit states. Date/times render in the viewer's device time zone.
- With the new schema installed, a staff member with support permission requests
  bounded access from that business. Another user with approvals.manage decides
  it in the existing inbox. The requester can read at most 25 diagnostic journal
  headers for that one company. Reads are audited, customer-log events are recorded,
  and expiry/revocation stops subsequent reads.
- Missing new RPC means the feature is unavailable and request actions are hidden.
  Permission/network errors remain errors. Direct database calls still enforce all
  permissions; UI conditions are not the authorization boundary.

## Retained drafts and remaining work

| Area | Current evidence | Still needed |
| --- | --- | --- |
| Price book/entitlements/rollout/MRR | Existing implementation and prior handoff | Full current-schema replay, hosted approval and real second-person walkthrough |
| Quotes/prorations/LTV/provider fees/usage drafts | Helpers and unapplied stores; no new provider action | Connected finance workflows, test-mode provider lifecycle/webhooks/reconciliation |
| API keys/webhook deliveries | Unapplied metadata RPCs | Key authentication/enforcement, delivery worker, signing/retry/dead-letter lifecycle |
| Global search/customer segments | Pure models and pending RPCs | Connected permission-scoped search/segments UI and runtime tests |
| Alerts/jobs/incidents/releases | Draft storage/uniqueness checks | Real observations, workers, retries, delivery, impact/rollback workflows |
| Service desk | Existing generic tickets; pending case RPCs | Unified case workflow, SLA/ownership, diagnostics integration |
| Partners/sandboxes | Metadata requests only | Approved provisioning, wholesale billing, isolation, lifecycle cleanup |
| Promotions | Presentation-only copy guard, archived-business guard | Staged validation, review and complete promotion/rollback evidence |
| AI governance | Pending read/calculation RPC | Currency-separated spend and usage evidence, provider enforcement; no certified spend claim |
| Audit integrity/DR | Existing append-only/MD5 mechanisms | Independent storage/verification and restored-backup drill; MD5 is not WORM |
| Performance | No current p95/SLO/load evidence | Representative workload and sustained-worker failure/recovery tests |
| Independent review | This agent's review and automated checks | A second person must read/review PR #66; not satisfied by rerunning tests |

No unavailable feature is exposed as a working new job, alert, partner or sandbox
control. This is a completed implementation batch, not production certification of
the entire programme.

## Verification commands

`npm run typecheck`, `npm test`, `npm run build`, `npm run check:lookups`,
`npm run check:navigation`, lint on changed source, `npm run test:platform`, and
`npm run test:platform:postgres`. Final run counts are recorded in STATUS.md.

The PostgreSQL runner compiles 43 existing pending migrations plus the new workflow
against a minimal synthetic baseline. It tests permissions, MFA/live session,
self-approval, distinct approver permissions, tenant isolation, direct-write denial,
unsupported-kind refusal, actual access/revocation, expiry without a worker, logs,
ACLs, and concurrent requests/approvals. It does not certify every existing RPC,
Supabase Auth HTTP integration or the complete hosted schema.

## Rollout gates

No verified hosted backup or restore drill was supplied. Do not apply hosted DDL.
No test-mode payment credential was supplied. No provider call/charge was made.
The isolated fixture contains two synthetic approvers; a real second platform user
and a real authenticated browser walkthrough remain outstanding. No Vercel action
is allowed under the current owner instruction.
