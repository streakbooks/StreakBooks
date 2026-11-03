# Accountant and firm console: audit, benchmark and delivery

1 November 2026. This delivery builds on the 17-platform accounting review in `docs/competitiveness/REVIEW-2026-11-01.md`. It concentrates on the supplied Firm and Accountant screens: client deadlines, bulk work review, month-end workflows and safe client access. It is not a certification of every application workflow or of jurisdiction-specific tax compliance.

## Audit findings and implemented remedies

| Finding | Change and financial/security effect |
|---|---|
| Firm screen only created/linked firms, with no work queue | Shared persisted practice work board on Firm and Accountant pages, with real APIs and Postgres storage. |
| Firm creation inserted a firm and its owner separately; the member-only SELECT policy could hide the first returning row | Atomic `create_practice_firm` RPC creates both rows; verified under the authenticated DB role. |
| Linking upserted company roles, including independently assigned roles | Atomic linking preserves all existing memberships and records provenance only for newly created grants. Suspended users are not reactivated. |
| Revoking deleted any matching non-owner roles regardless of provenance, and ignored failures | Atomic revocation removes only tracked, unchanged grants with no other active tracked firm link. Independently modified, permission-adjusted and legacy memberships are retained; the UI tells administrators to review them in Users & Access. Audit failure rolls back the operation. |
| Membership grant/revoke calls could fail partway through loops | RPC transactions encompass links, managed memberships and audit writes. No new remote notifications are sent. |
| Accountant queue had no date cutoff and excluded awaiting-approval bills | Explicit review-through date on every queue query, including journal dates and reconciliation statement dates; approval-waiting bills included. |
| Close checker could treat a filed future return as covering an earlier month end | Both tax period start and end must cover the reviewed date. Missing tax evidence/errors surface instead of silently becoming not applicable. |
| Tax adjustment form persisted account selections across company changes | Accountant workspace remounts per company. Posting controls respect tax permission and request explicit confirmation. Adjustment reference terminology replaces an internal idempotency label. |
| Financial close actions were offered without permission hints and could act on cached checks after a query error | Existing close panel is accessible from Accountant tools; locking/closing respects UI permission hints and lock is disabled on check errors. Database services remain authoritative. |
| No persisted assignments, deadlines, evidence, preparer/reviewer separation or bulk review | New `practice_tasks` model, optimistic versions, evidence notes, valid transition graph, independent completion, atomic bulk updates and CSV evidence exports. |

## Benchmark: practice implications across 17 platforms

Sources are official product/help documentation. Public capability descriptions are not hands-on usability or load measurements. Country, edition, plan and companion practice products matter. A dash or an unverified capability is not evidence that a competitor lacks it. The prior review covers accounting, reporting, integrations and business breadth; this table adds practice-specific design implications.

| Platform | Public evidence and benchmark | Applied requirement / remaining gap |
|---|---|---|
| Xero | [Practice Manager guidance](https://www.xero.com/uk/accountant-bookkeeper-guides/using-xero-to-simplify-compliance-and-improve-efficiency/) connects client work, deadlines and workloads; [Workpapers](https://learning.central.xero.com/student/path/4830-set-up-and-use-xero-workpapers) separates preparation and review. | Client work queues and separate preparer/reviewer implemented. Full workpaper packs, document requests and resource planning remain separate features. |
| QuickBooks Online | [Books review](https://quickbooks.intuit.com/learn-support/en-us/help-article/manage-client/month-end-reviews-finish-clients-open-tasks/L4GubaqKy_US_en_US) guides recurring client review. | Repeatable month-end packs plus live close checks and dated queue access. A task tick is not treated as proof of reconciliation. |
| Zoho Books / Practice | [Practice](https://www.zoho.com/practice/) and [client profiles](https://www.zoho.com/practice/help/clients/client-profiles.html) organize client tasks and requests. | Cross-client work board, assignments, deadlines and client-specific authorization. Client request messaging and external document collection are not introduced here. |
| MYOB | [Practice tasks](https://www.myob.com/au/support/myob-practice/tasks/tasks) and [schedule templates](https://practice-support.myob.com/pmframe/schedules) support repeatable client collaboration. | Reusable month-end template with unique company/period/task identities. Automatic calendar recurrence, digital signature and client reminders remain future work. |
| Sage Accounting / Sage for Accountants | [Client Management](https://www.sage.com/en-gb/accountants/client-management/) centralizes client workflows; [practice management](https://www.sage.com/en-gb/accountants/practice-management/) includes collaboration. | Firm portfolio access is checked separately from company access; owner/admin controls and explicit client switching. No claim of complete Sage practice-suite parity. |
| Akaunting | [Accountant access](https://akaunting.com/hc/docs/users-and-roles/adding-an-accountant/) and [roles](https://akaunting.com/hc/docs/users-and-roles/roles-and-permission-levels/) establish controlled collaboration. | Preserve independent client roles and distinguish firm membership from permission to view or post company data. |
| Wave | [Reports](https://support.waveapps.com/hc/en-us/articles/115005085723-Overview-of-the-Reports-page) and [transaction workflows](https://support.waveapps.com/hc/en-us/articles/208621646-Overview-of-the-Transactions-page) focus on bookkeeping visibility. | Simple actionable queues and exports. A dedicated multi-client practice calendar is not established by these sources. |
| FreshBooks | [Help centre](https://support.freshbooks.com/hc/en-us) covers accountant collaboration, projects, time and reconciliation. | Separate operational deadlines from posted financial effects. Time billing, retainers and practice WIP are not implemented by this board. |
| Odoo | [Accounting firm solution](https://www.odoo.com/industries/accounting-firm) integrates client projects, tasks, documents and billing. | Operational tasks connect to the existing finance workspace without a new posting engine. Integrated firm CRM, time sheets and engagement billing remain gaps. |
| NetSuite | [Financial management](https://www.netsuite.com/portal/products/erp/financial-management.shtml) emphasizes finance controls and close efficiency. | Auditable transitions, concurrency control and repeatable close work are minimum controls; enterprise consolidation and full close orchestration are not claimed. |
| Business Central | [Financial management](https://learn.microsoft.com/en-us/dynamics365/business-central/finance) ties operations and reports together. | Retain the shared ledger/report services and permission enforcement rather than copying accounting logic into task handling. |
| Sage Intacct | [Consolidated reporting](https://www.intacct.com/ia/docs/en_US/help_action/Consolidations/Global_Consolidations/Reporting/reports.htm) illustrates multi-entity financial context. | Cross-client work aggregation is explicitly operational; it does not sum balances across currencies or imply consolidation. |
| FreeAgent | [Accounting features](https://www.freeagent.com/features/accounting-software/) include jurisdiction-specific tax workflows. | Deadlines are explicitly entered by a professional; do not invent statutory due dates without jurisdiction, entity and filing-period rules. |
| Kashoo | [Product guidance](https://kashoo.com/) emphasizes simple accounting and accountant access. | Short create/edit/review paths, visible errors and no fake integrations. No dedicated practice close capability is inferred. |
| Manager Cloud | [Cloud edition](https://www2.manager.io/cloud/) and [workflow guides](https://www2.manager.io/guides/) emphasize broad accounting and multi-user access. | Tenant-scoped work, auditability and portable exports; stale-write rejection and atomicity verified in database transactions rather than inferred from cloud hosting. |
| Patriot | [Accounting](https://www.patriotsoftware.com/accounting/) and [reports](https://www.patriotsoftware.com/accounting/reports/) support accountant visibility. | Professional reporting remains in the report engine. The board adds review coordination, not alternative financial statements. |
| ERPNext | [Accounting introduction](https://docs.frappe.io/erpnext/accounting-introduction) and [reports](https://docs.frappe.io/erpnext/accounting-reports) stress document-to-ledger consistency and dimensions. | Keep tasks, ledger entries and tax filings distinct. A reviewed task never substitutes for a posted document or completed filing. |

## Delivered workflows

- Create a firm atomically; select a firm, link an authorized active company and open a client's books directly.
- Create/edit a client deadline, assign an active company member, record evidence and review the due date.
- Filter by accessible client, status, search and overdue state; paginate through due-date-ordered work; export the visible page to formula-safe CSV.
- Generate six month-end tasks per client and month: bank/cash, AR, AP, adjustments/depreciation/FX, tax, and financial statements/lock readiness. Repeated generation preserves existing tasks and reports zero newly created rows.
- Generate for at most 20 writable clients per request. Each client pack is atomic, with explicit created/error outcome per client; a multi-client pack request can partially succeed.
- Bulk start/reopen, block, submit for review, or independently complete at most 100 selected work records. Version snapshots and ordered row locks prevent stale overwrites; any denied, invalid or stale task rolls back the entire selected task batch.
- `todo → in_progress → ready → completed`; blocked and reopening paths are explicit. Completion requires a different user from the preparer. Reopening reviewed work is required before changing its details. Audit events retain before/after evidence, reviewer and timestamps.
- Open the existing financial close panel for bank, draft, AR/AP, opening balance, tax and year-end checks; authorized posting/locking remains in existing domain services.

## Architecture, security and scalability

Client: reusable React presentation component plus a TanStack Query/server-function container. Server: authenticated, validated functions with explicit company checks; firm scope verifies membership, active links and separate effective company permissions. Postgres is authoritative for task writes, transitions, reviewers, optimistic versions, assignments, MFA and audit. Direct client writes to `practice_tasks` and `firm_client_links` are revoked; SELECT has company RLS and the restrictive MFA policy. New privileged functions have fixed empty search paths, explicit authentication/authorization and no anonymous execution. Managed firm grants are private and inaccessible directly.

Permission mapping: `accounting.view` reads work; `accounting.post` manages operational work; `tax.settings` remains required for tax adjustments; `periods.lock` and `journals.manual` remain required for period locking and closing journals. This version does not introduce a separately configurable practice-work permission. It does not elevate a firm member into a company they cannot already access.

Queues page 200 tasks with deterministic due-date/id ordering; counts, filters and export are page-local and labelled accordingly. Firm workspace requests explicitly reject portfolios over 200 active linked clients instead of silently truncating. Those clients can use their individual company workspaces. This is bounded behavior, not a claim of enterprise-scale portfolio optimization. Client-scoped queue and actor/assignment indexes cover new table access paths.

Grant provenance: old membership rows are not retroactively classified as firm-owned. Unchanged tracked grants may be removed on revocation; independent, modified, permission-adjusted and legacy memberships require explicit review in Users & Access. Existing roles are not upgraded or downgraded by linking. Firm members added later receive grants on a subsequent authorized link action; no automatic staff synchronization or new invitation service is introduced. Existing company membership suspension and removal controls remain authoritative.

## Database rollout and verification

Applied to the connected Linkbooks project `ipxflpzfcqwtenodbxwc` with tracked migrations:

- `20261101105743_practice_workflows.sql`
- `20261101110316_practice_workflow_hardening.sql`
- `20261101111104_practice_access_write_boundary.sql`

Repository filenames match observed remote migration history. No real accounting records were changed or posted. The transactional SQL suite creates synthetic principals and companies, assumes the authenticated role, exercises permissions and workflows, and rolls back all fixtures and audit rows.

`supabase/tests/practice_workflows.sql` covers template idempotency; tenant denial; forbidden direct writes and anonymous execution; assignee isolation; verified-factor AAL1 denial; suspended-member denial; stale-version rejection; bulk rollback; independent completion; self-review rejection; atomic firm creation; null-parameter grant-authorization bypass prevention; independent role preservation; managed grant revocation; and audit creation.

Automated test commands:

```text
npm test
npm run typecheck
npm run build
npm run test:practice
```

The Playwright practice fixture validates real presentation components with in-memory workflow adapters. It is not a claim of authenticated browser-to-production-database testing. The SQL suite verifies real database boundaries separately. Existing accounting regression tests are retained.

Supabase advisor review after changes reports no finding for the new practice objects. Existing unrelated warnings remain, including mutable search paths and anonymously executable privileged functions elsewhere; these are not silently marked resolved. See the [Supabase function security guidance](https://supabase.com/docs/guides/database/functions) and [search-path advisor remediation](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable).

## Financial and product limits

Operational completion records a professional's review; it does not attest that a ledger is correct. No bank import, automatic reconciliation, tax filing, invoice authorization, fiscal-period lock or journal posting is performed by bulk work actions. Statutory dates are entered explicitly. No email, client portal message, recurring scheduler, workpaper attachment system, e-signature, team-capacity forecast, time billing, consolidated financial reporting or whole-platform production-readiness certification is implied.

Outstanding release evidence includes authenticated full-application browser checks with two accountant logins, production-like large-portfolio load, document-request integrations and jurisdiction-specific statutory calendar review. Existing independent access should be reviewed explicitly when migrating older firms to managed grants.

## Final verification results

- 154 Vitest files / 1,173 tests passed.
- TypeScript type checking and changed-file ESLint passed.
- Production build passed with existing framework deprecation warnings.
- Isolated practice browser workflow passed without page errors.
- Transactional SQL assertions passed against the connected database; all synthetic records rolled back.
- Performance advisor findings on new objects are informational unused actor indexes in this new, low-volume table; retained to support foreign-key and actor access paths. No new security-advisor finding remains on practice objects.
