# LinkBooks Platform Super Admin — implementation and operational runbook

Status: **development branch, not yet production-certified** (30 October 2026).

## Entry points
- \`/platform-admin\`: multi-tenant operations, organisation overview, subscriptions, plan catalogue, checkout events, staff, and audit.
- \`/platform/billing\`: existing **versioned** price editor, review, publication and rollback. It is deliberately preserved.
- Customer organisation roles never grant platform authority.

## Permissions
| Role | Overview/organisations | Payments/plans | Audit/staff | Mutation |
| --- | --- | --- | --- | --- |
| platform_owner | Yes | Yes | Yes | Audited visibility and staff changes |
| platform_finance | Yes | Yes | No | None in the new console |
| platform_support | Yes | No | No | None in the new console |
| ordinary company owner | No | No | No | No |

The authenticated user must have a verified AAL2 MFA session for all \`/platform-admin\` data reads and mutations. Server middleware validates access; privileged PostgreSQL functions recheck platform owner and AAL2, inside the DB transaction. A service-role key is never sent to the browser.

The platform owner must be provisioned by the existing one-time \`bootstrapPlatformOwner\` flow in \`/platform/billing\`, with an exact \`PLATFORM_OWNER_EMAIL\` server setting, a confirmed email, and MFA. The database currently has no platform owner. **Never automatically promote the first customer or company owner.** Platform owner promotion beyond bootstrap remains a trusted database/admin procedure.

## Deployment checklist
1. Review and merge the feature PR only after CI/unit/typecheck and preview environment smoke tests.
2. Confirm \`supabase/migrations/20261030191100_platform_super_admin.sql\` was applied. Its actions already ran successfully in the connected project. Coordinate migration-history reconciliation with any migration tooling; do not replay the same change blindly.
3. Configure server-side \`PLATFORM_OWNER_EMAIL\`, \`SUPABASE_URL\`, \`SUPABASE_PUBLISHABLE_KEY\`, \`SUPABASE_SERVICE_ROLE_KEY\`. Never use VITE_ for the service-role key.
4. Complete verified email and two-step verification for the chosen owner. Visit \`/platform/billing\` once to bootstrap, then \`/platform-admin\`.
5. Test owner, finance, support, ordinary company owner, and anonymous sessions: permitted and forbidden views.
6. Test plan visibility updates and staff role changes with audit reasons, invalid IDs, expired session, AAL1 session, and concurrent operations. Ensure active subscriptions continue unaffected.
7. Verify country-specific checkout and versioned pricing independently. The new catalogue visibility action does not publish a versioned price or update an existing provider subscription.
8. Confirm no secrets, personal financial records, provider tokens, or payment card data appear in client payloads or logs.
9. Load test pagination, count queries, backend functions, 1,000 concurrent users, query indices and tenant isolation before production launch.
10. Review existing Supabase security advisor warnings, notably several pre-existing publicly executable SECURITY DEFINER functions, and remediate in separate audited migrations.

## Functional audit (feature-level)
- PASS (database): Legacy self-serve billing operator insertion revoked; two owner/MFA-checked audit-writing RPCs installed.
- IMPLEMENTED, TESTING PENDING: Dashboard, organisation list/search/pagination, billing checkout list, plan visibility controls, staff management, audit views.
- EXISTING, REGRESSION TESTING PENDING: Versioned plan publication, localized checkout, subscription webhook processing.
- NOT IMPLEMENTED: Internal support tickets, tenant-safe impersonation with consent, refund authorization, dunning jobs, settlement reconciliation, refund gateway APIs, internal SRE observability, tenant suspension/restore workflow, finance revenue recognition, bulk exports, data retention/deletion workflow.

## Product benchmarking set (17 reference systems)
| Platform | Benchmark capability for LinkBooks |
| --- | --- |
| Xero | Automated reconciliation, adviser practice experience, integration ecosystem |
| QuickBooks Online | Granular roles, approval workflows, AR/AP lifecycle, reporting |
| Zoho Books | Workflow automation, customer/vendor portals, localization |
| Sage Accounting | Tax compliance, invoice/bank automation |
| Sage Intacct | Multi-entity consolidation, close controls, dimension reporting |
| MYOB Business | AU tax and payroll workflows |
| Odoo Accounting | Fiscal localization, intercompany, bank matching and analytics |
| FreshBooks | Time billing, client journeys, projects |
| Wave | Simple self-service onboarding and essential bookkeeping |
| Akaunting | Modular accounting, extensibility and open integrations |
| NetSuite | Enterprise consolidation, audit and revenue recognition |
| Acumatica | Project accounting, operational ERP integration |
| Dynamics 365 Business Central | Intercompany, dimensions, approvals, close |
| ERPNext | Open accounting/stock/procurement integration |
| FreeAgent | Small business tax and accountant collaboration |
| Patriot Software | Payroll/accounting workflows for smaller firms |
| Kashoo | Simple bookkeeping, categorization and setup |

This is a benchmark coverage plan, **not evidence that all 17 were exhaustively tested** and not a completed company-wide requirement-by-requirement audit. The current implementation specifically covers central SaaS operations, not all accounting modules.

## Security advisory references
- Supabase Row-Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase SECURITY DEFINER linter: https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
- Supabase mutable search_path linter: https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable
