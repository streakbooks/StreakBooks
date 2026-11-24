# StreakBooks Superadmin implementation handoff

Date: 30 October 2026. Repository: `/workspace/StreakBooks`. Entry point: `/platform`.

This delivery implements a working administration control plane in the existing application. It does **not** complete every requirement in the supplied fifteen-phase specification. The database workflows below have been tested against the connected StreakBooks Supabase project. Frontend compilation, types and lint are checked separately; authenticated browser acceptance remains outstanding.

## Architecture and audit findings

StreakBooks uses React 19, TanStack Start/Router, React Query, Tailwind, existing Radix/shadcn components, Recharts, Supabase Auth and PostgreSQL with RLS. Nitro/Vercel build configuration already exists. The repository contains established double-entry accounting, sales, purchases, banking, reconciliation, reports, tax, fixed assets, budgets, documents, firms, subscriptions, Stripe/Razorpay helpers and Resend transport. Their presence does not establish that external providers are configured or production-ready.

The audit inspected repository instructions, routes, server authentication, role helpers, accounting and firm access policies, subscription entitlements, billing mutations, integration configuration and migration history. It was a focused architecture and security audit, not an exhaustive penetration test of every accounting RPC or jurisdictional tax rule.

Findings addressed:

- Platform pages previously depended on company onboarding and had no independent administration shell.
- Platform billing reads and multi-step price changes used a service-role client; a partial failure could leave price versions inconsistent.
- Privileged access did not uniformly require a current, active AAL2 session.
- Owner bootstrap relied on an environment email and separate count/insert operations. Online self-promotion is now disabled; initial owners require privileged provisioning.
- Firm RLS allowed arbitrary self-enrolment, and client linking/access increases could bypass server checks through direct database requests.
- New scoped roles needed both database enforcement and company-switcher/UI permission integration.
- Refund handling did not verify the Stripe payment's customer and currency against the target company.

Preserved: existing company-role enum, accounting math, ledger/posting functions, payment provider integrations, customer subscriptions and historical financial data. Global templates do not update existing company accounting settings. Published prices do not migrate existing subscribers.

## Implemented and database-tested

| Area                 | Working behavior                                                                                                                                                                                                                                                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Overview             | Actual non-demo business counts, active/inactive/suspended counts, live trials, users, 30-day signed-in active users, firms, subscriptions, cancellations and past-due subscriptions. Date-filtered registration series and plan distribution. Current MRR/ARR calculated from eligible active subscriptions, separated by currency. |
| Businesses           | Search, chronological sort, pagination, creation through the existing chart/period provisioning routine, separate owner assignment, name/status changes, archive/restore, custom storage caps and membership assignment. Bulk status changes are atomic and audited per business.                                                    |
| Firms                | List, details, create/edit and employee role assignment. Custom firm roles require actual firm membership and an active client link; client link access levels cap their effective permissions.                                                                                                                                      |
| Users                | User directory, profile-name edits, activate/deactivate/suspend application access, MFA requirements, session counts/details, company/firm assignments and session revocation. Existing JWTs issued before revocation are denied by customer access helpers.                                                                         |
| Custom RBAC          | Platform, firm and company scopes; multiple assignments; editable roles; immediate permission lookup; assignment revocation; action-specific create/edit/export controls alongside Manage. Superadmin alone defines and delegates roles and authorizes customer support access.                                                      |
| Customer navigation  | Explicitly scoped companies appear in the company context; effective permissions feed common permission hooks, creation controls and journal-reversal hints. Platform authority alone never adds a company to customer navigation.                                                                                                   |
| Subscription/pricing | Actual subscription records and provider event history. Price drafting, publication and rollback are transactional, owner-controlled, audited and preserve other prices and entitlements. Existing subscribers retain their price version.                                                                                           |
| Feature control      | Server-enforced writes for accounting, sales, purchases, banking, budgets, fixed assets, documents and projects. Global/tenant controls, existing business feature flags, plan limits and user permissions combine. Historical records remain readable.                                                                              |
| Support              | Persisted ticket creation/editing/status changes, separately authorized one-hour support grants, expiry/revocation enforcement, and audited reads of up to 25 journal headers. No automatic staff ledger membership or unrestricted financial browsing.                                                                              |
| Notifications        | Persisted and scheduled in-app announcements, global or company-specific, displayed in the accounting shell. Drafts are separate from active announcements.                                                                                                                                                                          |
| Operations           | Real database reachability, database bytes, stored attachment bytes, and maintenance status. Maintenance stops customer writes while retaining reads.                                                                                                                                                                                |
| Audit/security       | Application-level append-only administrative audit records, mutation reason, actor, before/after values, timestamp, session and forwarded request address. MFA, live-session checks, rate limiting and tightly granted invoker RPC entry points. Export permission checks and audited, spreadsheet-safe page exports.                |

Database acceptance suites also verify that storage limits reject excess attachment metadata, invoices remain present after suspension, failed bulk changes roll back, stale configuration edits fail, and unauthorized secret fields are rejected.

## Implemented but not externally verified

- Frontend routes, responsive shell, forms, tables, dialogs, charts and navigation compile and typecheck. They need an authenticated browser walkthrough with an authorized MFA test account.
- Refund code verifies provider customer, currency and captured amount, records request/acceptance audit entries and uses Stripe idempotency. Its pure authorization policy is unit-tested. The actual Stripe refund flow is unverified and needs server credentials, service-role access, an authorized sandbox payment and provider reconciliation.
- Existing customer checkout, plan-change and payment integrations remain in the repository. No new live payment or email was sent during this task.

## Partially implemented

- Accounting configuration is a persisted country-aware defaults registry with basic fields. It does not implement a full global chart-of-accounts/tax/reporting/numbering template publisher or automatically apply defaults to new businesses.
- Integrations display server credential **presence**, explicitly not verified connectivity. Integration notes and API policies are persisted registries. They do not configure provider secrets, issue API keys, enforce gateway rates or prove webhook health.
- Subscription administration has real views and transactional plan pricing. A complete platform UI for provider-driven upgrades, downgrades, cancellations, renewals, add-ons, discount management, invoices, outstanding balances and refunds is not delivered.
- Customer role templates cover the existing legacy roles plus Platform Admin, Firm Manager and Approver. Legacy screens that gate directly on role names may still need conversion to effective permissions; common permission hooks and the principal creation/journal controls were updated.
- Retention settings are stored as policy metadata. No automatic customer, financial or audit-data deletion runs.
- Support access intentionally returns diagnostic journal headers only. A consent-driven full financial support workspace is not implemented.

## Not implemented or not validated

- Platform user creation, invitation send/resend/revoke and password-recovery administration; detailed login/failed-login history; individual session selection and MFA factor recovery.
- Historical MRR/ARR, subscription growth and upgrade timelines, retention cohorts, churn and lifetime value. Current subscription snapshots cannot establish historical metrics reliably.
- Outstanding invoice amounts, verified payment failure totals and cross-currency transaction volume when there is no reconciled source. Past-due subscriptions are labeled as such and are not presented as failed payments.
- Banking/tax/FX/provider adapters beyond the existing repository integrations; full webhook delivery history and third-party app credential management.
- Full API key lifecycle, gateway usage/rate-limit enforcement, infrastructure uptime/latency/error/queue/job/backup feeds, automated alerts and backup restore validation.
- Full country-specific accounting-template management and new accounting modules absent from the original implementation.
- External email reminders for subscription/payment/suspension events.
- Browser accessibility/device acceptance, load testing, penetration testing and deployment acceptance. No production publication or repository push was performed.

## Role and permission matrix

| Requested role        | Representation                | Authority                                                                                                                                                                   |
| --------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Superadmin            | Legacy `platform_owner`       | All platform actions through an active AAL2 session; special role delegation, price publication/rollback and support authorization. No implicit customer accounting access. |
| Platform Admin        | Seeded platform custom role   | Business, firm, user, configuration, support and operations management; cannot create Superadmins, delegate roles, publish prices or authorize financial support grants.    |
| Support Admin         | Legacy `platform_support`     | Overview, business/user/firm lookup and support ticket management. Financial diagnostic reads require a separate grant. Refund execution is not delegated to support.       |
| Accounting Firm Owner | Existing firm `owner`         | Existing firm workspace; customer access remains separately authorized.                                                                                                     |
| Firm Manager          | Seeded firm custom role       | Assigned firm/client operations; requires firm membership, active link and permissions capped by link access level.                                                         |
| Business Owner        | Existing company `owner`      | Existing company permission catalogue.                                                                                                                                      |
| Accountant            | Existing company `accountant` | Existing accounting permission catalogue.                                                                                                                                   |
| Bookkeeper            | Existing company `bookkeeper` | Existing bookkeeping permission catalogue.                                                                                                                                  |
| Approver              | Seeded company custom role    | Company/accounting read and designated sales/purchase/expense approval permissions.                                                                                         |
| Viewer                | Existing company `read_only`  | Existing read-only permission catalogue.                                                                                                                                    |

Company custom roles use actual keys from `role_permissions`, such as `sales.draft`, `sales.authorise`, `reports.export` and `members.manage`. Platform keys follow `resource.action`: `view`, `create`, `edit`, `delete`, `approve`, `export`, `manage`. Manage includes the implemented resource actions. Delete/Approve keys only have effect where an authorized workflow actually implements that operation; they do not create destructive endpoints. Role delegation and price publication remain reserved independently of arbitrary custom role keys. Opening a scoped customer workspace requires both `company.view` and explicit `accounting.view`, as well as the intended module/action permissions. The existing accounting engine treats accounting-read membership as broad financial read access; this compatibility boundary is intentional. A metadata-only company-view assignment does not grant financial-workspace access. Narrow financial-read scoping across every legacy reporting RPC is not complete.

## API reference

All new public RPCs use `SECURITY INVOKER`, an empty search path and explicit authenticated grants. Their private implementations validate current authorization. Anonymous EXECUTE is revoked. Administrative writes require a reason and are transactional unless an external provider is involved.

| RPC                        | Parameters                                           | Result                                                                             |
| -------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `platform_context`         | none                                                 | Current staff role, allowed capabilities, user ID. Requires active MFA session.    |
| `platform_overview`        | `_from date`, `_to date`                             | Snapshot and actual registration/plan series. Maximum 730-day registration window. |
| `platform_list`            | `_resource`, `_search=''`, `_page=0`, `_sort='desc'` | Up to 25 projected rows, total and page size. Resource-specific View permission.   |
| `platform_details`         | `_resource`, `_id uuid`                              | Business/user/firm relationships; lists bounded to 100 and sessions/events to 50.  |
| `platform_mutate`          | `_action`, `_id=null`, `_payload={}`, `_reason`      | `{ok,id}`. Known actions only; secrets rejected from registry details.             |
| `platform_bulk_business`   | `_ids uuid[]`, `_status`, `_reason`                  | Atomic status change for 1–100 businesses.                                         |
| `platform_price_action`    | `_action`, `_payload`, `_reason`                     | Draft/publish/rollback outcome. Existing billing staff/owner rules apply.          |
| `platform_support_read`    | `_company_id`                                        | Up to 25 journal headers after separate support authorization; read is audited.    |
| `platform_health`          | none                                                 | On-demand measurements and nulls for missing telemetry.                            |
| `platform_export`          | `_resource`, `_search=''`, `_page=0`                 | Permission-checked, audited page export. Server wrapper preserves selected sort.   |
| `platform_announcements`   | `_company_id=null`                                   | Up to five current announcements authorized for the signed-in user.                |
| `platform_company_context` | none                                                 | Only direct/scoped authorized companies and effective permission hints.            |

Mutations: `business.create`, `business.update`, `user.update`, `user.revoke`, `role.save`, `role.assign`, `role.revoke`, `member.assign`, `firm.save`, `firm.member`, `support.grant`, `support.revoke`, `record.save`. See `src/lib/platform/catalog.ts` and migration definitions for input contracts. Business creation uses the original company provisioning engine and its existing constraints.

TanStack server functions in `src/lib/platform/platform.functions.ts` add authenticated request middleware, Zod input validation and `Cache-Control: private, no-store`. Core control-plane operations use the caller's publishable-key/user-token client, not a service-role bypass. Refund/provider operations still require the existing server-only administrative/provider credentials.

## Security status and remaining advisories

No passwords, service-role credentials or provider secrets are returned by the new console. Secret-looking registry fields are not supported; credentials remain in server environment configuration. Text is rendered as text rather than injected HTML. Search values are SQL parameters and resource/sort choices are allowlisted.

Audit immutability is enforced against application roles and ordinary updates/deletes/truncation. A database superuser can still alter triggers or restore a database; this is not external WORM storage. Forwarded request addresses are recorded as supplied by the upstream request path, not used as authorization proof.

Supabase advisors still report pre-existing items: mutable search paths, anonymous/authenticated executable definer functions and disabled leaked-password protection. Authenticated definer functions may be intentional but need individual authorization review. The private rate-limit table intentionally has no caller policy or grants; only the checked definer helper owns access. This is fail-closed, not a publicly writable table.

Reference remediation:

- [Search paths](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable)
- [Anonymous definer endpoints](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable)
- [Authenticated definer endpoints](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
- [Leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)

The existing firm-linking workflow materializes company memberships without provenance. Historical memberships cannot safely be classified as independent versus firm-derived automatically. Review those legacy memberships during firm offboarding; new scoped-role checks themselves require current links and enforce link revocation/access caps. This delivery does not retroactively delete customer memberships.

Encryption-at-rest, TLS termination, password policies, infrastructure backup guarantees, provider webhook delivery and jurisdictional legal compliance were not independently validated.

## Deployment and environment setup

Eight migrations were applied through the connected Supabase tools to project `ipxflpzfcqwtenodbxwc` and mirrored with the exact recorded versions in `supabase/migrations`:

1. `20261030144257_superadmin_control_plane.sql`
2. `20261030145148_superadmin_transactional_billing_and_hardening.sql`
3. `20261030145424_superadmin_scoped_controls_and_operations.sql`
4. `20261030145608_superadmin_staff_account_controls.sql`
5. `20261030150225_superadmin_firm_client_authorization.sql`
6. `20261030150410_superadmin_action_permissions_and_exports.sql`
7. `20261030150724_superadmin_scoped_company_navigation.sql`
8. `20261030151219_superadmin_explicit_scoped_accounting_read.sql`

The Supabase CLI was unavailable locally and package download was blocked by the execution environment; connected tools supplied real migration versions. Do not reapply these migrations manually to the same database. Other environments must have the repository's prerequisite schema and migrations before applying them in order. Remote history also contains older migrations absent from the original checkout; reconcile that existing drift before a clean-environment deployment.

Required existing runtime variables: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`. Provider/admin features additionally use existing server-only variables, including `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RESEND_API_KEY` and `EMAIL_FROM` where applicable. Never prefix server secrets with `VITE_`.

No new dependencies were installed. Build with `npm ci`, `npm test`, `npm run typecheck`, `npm run build` using the existing supported Node/Nitro deployment configuration. Do not infer provider readiness merely from configured variable names. The current execution environment supplied publishable client configuration; provider/admin credentials were not available for verification.

For an initial owner, a trusted database operator must identify an existing confirmed Auth user, verify MFA enrollment, then insert the intended `platform_owner` assignment. Do not grant this privilege through user metadata, email matching alone, a browser endpoint or a public sign-up flow. Existing owners remain unchanged. Sign in, enroll/verify MFA under Profile → Security, then open `/platform`. Staff without a business can open the console directly.

No deployment or git push has been performed. Build artifacts were generated locally.

## Validation and test execution

- Full Vitest regression suite, TypeScript, targeted ESLint and production build: see the accompanying validation report for final results.
- `tests/integration/platform-security.sql`: actual role/MFA/session/tenant/support/audit workflows, all list endpoints and owner/customer separation.
- `tests/integration/platform-operations.sql`: provisioning, relationships, bulk rollback, record lifecycle, announcements, module permissions, user MFA, firm caps, create-only permissions, export authorization and price-version preservation.
- `tests/integration/platform-enforcement.sql`: storage caps, financial-record preservation and maintenance write/read separation.

The database suites run as an authorized database test operator, create disposable Auth/session/company fixtures, simulate checked JWT claims for database authorization tests and **ROLL BACK** everything. They do not replace HTTP JWT-signature or browser sign-in tests. Run on staging or through the same authorized connected SQL tool. Do not remove the transaction/rollback boundaries.

Browser suite: `e2e/platform.spec.ts`. Install the supported Playwright Chromium runtime and provide `E2E_PLATFORM_STORAGE_STATE` for an authorized MFA-enabled Superadmin test session, then run `npm run test:e2e -- e2e/platform.spec.ts`. Do not commit storage-state files. Existing accounting E2E tests use their existing `E2E_EMAIL`/`E2E_PASSWORD` configuration. Without those credentials the suites skip; a skip is not a passing workflow.

## Backup and rollback

Before deploying to any additional environment, record the application revision and migration history and take a protected provider snapshot or authorized database backup. Include both private control-plane and public accounting schemas, storage objects and provider webhook configuration. Keep backups encrypted and restrict restore credentials. This task did not create or restore a backup.

Prefer an application rollback while retaining these additive database migrations, audit records and access restrictions. Reverting to the old application does not require dropping customer or platform tables. If a newly configured feature or maintenance setting blocks legitimate writes, an authorized Superadmin can restore its state through the audited console.

A database rollback needs a reviewed forward migration: preserve/export audit records; remove only the named `platform_write_guard`/`firm_client_link_authorization` triggers if their change is explicitly being rolled back; restore affected access-helper definitions from the prior reviewed migration; restore the application version and re-run isolation and accounting tests. Do not broadly revoke RLS, disable all triggers, drop financial tables or delete audit history. Database-helper rollback may reopen the vulnerabilities fixed here, so it is not supplied as an automatic destructive script.

Verify restoration on a disposable environment, reconcile provider state independently of a database restore, and validate journal balance, subscription versions, tenant isolation and active session policy before reopening traffic.
