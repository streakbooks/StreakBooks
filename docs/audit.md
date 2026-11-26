# Phase 0 audit — owner control, sales, post-purchase access, and role dashboards

Audit date: 2026-11-26  
Repository: [streakbooks/StreakBooks](https://github.com/streakbooks/StreakBooks)  
Baseline: `fa969da4d85ca173e04444e80103a6c500335e7f` on `main`.  
Working branch: `feat/owner-access-and-sales`, created from the clean main checkout.  
Scope: read-only source, GitHub, deployment-context, and connected Supabase project inspection. No secret values were read, no database writes were made, and no migration was applied.

## Executive findings

- The platform console, company accounting workspace, and firm practice workspace already exist. Users share one sign-in; the app does not create three identities or choose a role-specific dashboard after login. A dashboard workspace chooser exists, but it is navigation only.
- Roles are separate in the database: `public.platform_roles`, `public.company_members`, `public.firm_members` and `public.firm_client_links`. The connected database has two platform-owner rows. Signup sends only `full_name` metadata and has no platform role input.
- Server-side platform authorization checks verified MFA (`aal2`) and current session state. The superadmin route is `/platform`, not `/admin`. Company/firm data access also uses server-side permission checks and RLS.
- No owner-bootstrap CLI was found. The platform audit table has zero login actions. Platform mutation audit exists; platform login audit is missing.
- Stripe and Razorpay hosted subscriptions, signature-checked webhooks, durable event deduplication, a versioned price book, audiences, trial settings and per-feature prices exist. Standard company checkout requires a pre-existing company and `billing.manage`; the public buyer-to-tenant/owner invitation flow is missing.
- Subscription start dates are recorded on new subscription inserts only. The migration deliberately does not backfill. The live table currently has zero company-subscription rows, so its current unknown-start count is zero; historical rows would remain unknown if present.
- Local migrations: 377. Hosted migration ledger: 378. Every local version is recorded remotely; hosted has one extra version `20261124112655 / streakbooks_report_worker_dispatch_url` without a local SQL file.
- All 470 public tables have RLS enabled. Across the full database catalog, 567 tables were listed (541 RLS enabled, 26 disabled); Supabase reports 83 RLS-enabled/no-policy findings. RLS-without-policy defaults to deny for normal database roles, but no-policy tables and service/RPC access paths need review.
- Supabase reports 27 anon-executable SECURITY DEFINER functions, 764 authenticated-executable SECURITY DEFINER functions, leaked-password protection disabled, and an error-rate advisory for `/functions/v1/reporting-worker` (5 of 5 recent requests failed).

## Git state and unmerged work

The checkout was clean at audit start and matched `origin/main`. This task created the requested local feature branch. No task files had been changed at audit start.

Last 20 commits at the audit baseline:

- `fa969da4 Distinguish billing view and management access (#88)`
- `1849148f Add role-aware StreakBooks workspace chooser (#87)`
- `39e9b796 Add separate Advisors checkout and client experience`
- `7f098598 Add Razorpay Standard Checkout`
- `ea5f3051 Resolve Dependabot alerts for minimatch and uuid.`
- `a834f105 Enable launch billing prices for price-book plans.`
- `e9169ee9 Revert "Support Cloudflare Pages builds via NITRO_PRESET=cloudflare_pages."`
- `e27582ed Support Cloudflare Pages builds via NITRO_PRESET=cloudflare_pages.`
- `8cd899ad Fix exactOptionalPropertyTypes for brand className`
- `68ebd5f8 Make StreakBooks logo readable on dark chrome with a white brand plate.`
- `6e1c8d60 Fix StreakBooks logo assets for transparent and light backgrounds.`
- `1ea2b8bd Rebrand LinkBooks to StreakBooks and publish to org remote.`
- `81bb9f90 Merge pull request #500 from linkbusinessadvisory/docs/batch186-ledger-status`
- `ddc80d2f docs(premium-ui): mark Batch 186 done in ledger`
- `78d7bd2f Merge pull request #499 from linkbusinessadvisory/feature/premium-ui-batch186-production-gaps`
- `f893557c fix(premium-ui): Batch 186 isSuccess before crash-risk early-return data`
- `021b5af3 Merge pull request #498 from linkbusinessadvisory/docs/batch185-ledger-status`
- `b2c12d83 docs(premium-ui): mark Batch 185 done in ledger`
- `8718c49d Merge pull request #497 from linkbusinessadvisory/feature/premium-ui-batch185-production-gaps`
- `af119736 feat(premium-ui): Batch 185 isSuccess before crash-risk early returns`

GitHub branch search returned `main`, `codex/advisors-public-checkout`, `codex/billing-permission-label-20261126`, and `codex/workspace-access-dashboard-20261126`; open-PR search returned none. Local `origin/pr-86` is a stale tracking ref and did not appear in GitHub branch results. The feature branch is local only; it has not been pushed or merged.

## Stack, environment, deployment

Verified from `package.json` and source:

- Vite 8.3.5, React 19.2, TypeScript, TanStack Start 1.168.60 and Router 1.170.41.
- Supabase JS 2.117.2 and PostgreSQL 17.12; Tailwind 4, Radix UI primitives, Vitest 5.0.5, ESLint 9, Playwright 1.64.1.
- Vercel/Nitro build output is configured by the Vite/Nitro setup. No root `vercel.json`, `wrangler.toml`, or Netlify config was found.
- The Vercel connection exposes the LinkBusiness Hobby team but no linked projects; project lookup for `streakbooks` returned not found. `docs/VERCEL.md` lists `https://streakbooks-navy.vercel.app`; repository instructions identify `https://streakbooks.com/` as the product site. Neither URL was verified as the current application production deployment. Latest-main Vercel statuses link to an organization plan upgrade page.

Environment variable names only (no `.env` values were read):

- `.env.example`: `VITE_SUPABASE_PROJECT_ID`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_PROJECT_ID`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`.
- Server source also references `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `ADVISORS_RAZORPAY_KEY_ID`, `ADVISORS_RAZORPAY_KEY_SECRET`, `PORTAL_STRIPE_WEBHOOK_SECRET`, `PORTAL_RAZORPAY_WEBHOOK_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `APP_BASE_URL`, `APP_ORIGIN`, `VITE_APP_ORIGIN`, `BILLING_IP_HASH_SECRET`, `STREAKBOOKS_CRON_SECRET`, `STREAKBOOKS_CRON_SECRET_PREVIOUS`, `LOVABLE_CRON_SECRET`, `LOVABLE_CRON_SECRET_PREVIOUS`, `MARKETPLACE_OAUTH_VAULT_KEY`, `APP_STORE_OAUTH_VAULT_CONFIGURED`, `ADVISORS_ALLOW_LIVE_PAYMENT_KEYS`, `MESSAGING_RETENTION_PURGE_EXECUTE`, `E2E_PRODUCTION_URL`, and `E2E_STAGING_ENABLED`.
- `.env.example` only names the Supabase variables; optional provider, webhook, email, service-role, cron and E2E variables are undocumented there. Runtime secret presence was not inspected.

## Authentication and role model

| Surface | Role source and server gate | Login/landing | Audit status |
|---|---|---|---|
| Platform owner/staff | `platform_roles`, custom platform roles/assignments; `platform_role()` requires JWT `aal2` and live session; RPCs call `private.require_platform` | Shared `/auth`; `/platform` verifies using `platform_context()`; MFA required | Role/MFA guards exist. Bootstrap CLI and login event audit were not found. |
| Business owner/user | `company_members.role` plus `role_permissions`; RLS and `assertCompanyPermission` | Shared `/auth`; safe explicit redirect or default `/`; no role-based auto-route | Company onboarding, books and subscription settings exist. Purchase checkout does not create the tenant. |
| Firm owner/staff | `firm_members`, `firm_client_links`, client/company grants | Shared `/auth`; default redirect is not role-aware; firm route `/firm` | Portfolio, work, invites, team, engagements, requests, billing, analytics and activity tabs exist. Staff-to-client scope requires validation. |

Company roles are `owner`, `admin`, `accountant`, `bookkeeper`, `staff`, `read_only` (`src/lib/company-constants.ts`). Public signup in `src/routes/auth.tsx` sends only `full_name`; it cannot assign a platform role. Sign-in uses `safeRedirect`, then returns to `/` when there is no explicit destination. The authenticated company layout sends users without companies to an authorized portal or `/onboarding`, not to `/firm` based on role.

## Dashboard and route inventory

| Surface | Existing route/evidence | Status |
|---|---|---|
| Platform admin | `/platform`, `/platform/operations`, `/platform/billing`, `/platform/automation`; `src/routes/_authenticated/platform*.tsx`, `src/components/platform/*` | Partial/implemented. Tenant/user/firm/subscription controls, support, billing, approvals and monitoring exist. Bootstrap and login audit are missing; production flow unverified. |
| Direct subscriber | `/`, `/onboarding`, `/settings?section=subscription`; authenticated company modules | Implemented for an existing company. Dashboard and subscription management exist; not a separate login. |
| Accountant | `/accountant`; `src/routes/_authenticated/accountant.tsx`, `src/lib/accountant/*` | Implemented within authorized company context; client permissions apply. |
| CPA/CA/bookkeeping firm | `/firm`, `/firm-invite/$token`; `src/routes/_authenticated/firm.tsx`, `src/components/firm/*` | Firm practice tools exist; staff/client scoping, visible audit, elevated approval, payer and seat rules need verification/implementation. |
| Link Business Advisory service | `/advisors`, `/advisors-portal`, `/advisors-admin` | Separate client service and merchant checkout; preserve separate company/merchant ownership. |

## Supabase project, catalog, and migration history

Connected project `qugoaaizclvkzesptovm` is `ACTIVE_HEALTHY` in `ap-southeast-2`, PostgreSQL 17.12.

- Local migrations: **377**. Hosted migration ledger: **378**.
- Hosted-only: `20261124112655 — streakbooks_report_worker_dispatch_url`; there is no local source file. No local-only versions were found.
- Local newest: `20261125164222_advisors_razorpay_public_checkout.sql`.
- Migration source `20261102160000_subscription_start_cohorts.sql` contains a stale comment saying it was not applied; the hosted ledger includes that version. Never edit an applied migration.
- No migration was applied during this audit.

### Live table inventory

Catalog query returned 567 tables across application and Supabase-managed schemas. Public: 470/470 RLS enabled. All application tables in public are RLS-enabled; the full database includes managed auth/storage/realtime/system tables with differing settings. **RLS enabled does not mean forced RLS.** None of the catalog tables had FORCE RLS set.
  
| Table | RLS | Forced |
|---|---|---|
| `auth.audit_log_entries` | enabled | no |
| `auth.custom_oauth_providers` | disabled | no |
| `auth.flow_state` | enabled | no |
| `auth.identities` | enabled | no |
| `auth.instances` | enabled | no |
| `auth.mfa_amr_claims` | enabled | no |
| `auth.mfa_challenges` | enabled | no |
| `auth.mfa_factors` | enabled | no |
| `auth.mfa_recovery_code_sets` | disabled | no |
| `auth.mfa_recovery_codes` | disabled | no |
| `auth.oauth_authorizations` | disabled | no |
| `auth.oauth_client_states` | disabled | no |
| `auth.oauth_clients` | disabled | no |
| `auth.oauth_consents` | disabled | no |
| `auth.one_time_tokens` | enabled | no |
| `auth.refresh_tokens` | enabled | no |
| `auth.saml_providers` | enabled | no |
| `auth.saml_relay_states` | enabled | no |
| `auth.schema_migrations` | enabled | no |
| `auth.scim_tokens` | disabled | no |
| `auth.scim_users` | disabled | no |
| `auth.sessions` | enabled | no |
| `auth.sso_domains` | enabled | no |
| `auth.sso_providers` | enabled | no |
| `auth.users` | enabled | no |
| `auth.webauthn_challenges` | disabled | no |
| `auth.webauthn_credentials` | disabled | no |
| `billing.api_idempotency` | enabled | no |
| `billing.billing_account_companies` | enabled | no |
| `billing.billing_accounts` | enabled | no |
| `billing.cancellation_requests` | enabled | no |
| `billing.commission_ledger` | enabled | no |
| `billing.commission_rules` | enabled | no |
| `billing.countries` | enabled | no |
| `billing.country_pricing_rules` | enabled | no |
| `billing.coupon_redemptions` | enabled | no |
| `billing.credit_notes` | enabled | no |
| `billing.currencies` | enabled | no |
| `billing.exchange_rates` | enabled | no |
| `billing.invoice_lines` | enabled | no |
| `billing.invoice_series` | enabled | no |
| `billing.invoices` | enabled | no |
| `billing.legal_acceptances` | enabled | no |
| `billing.legal_documents` | enabled | no |
| `billing.partner_payouts` | enabled | no |
| `billing.partner_program` | enabled | no |
| `billing.partner_program_changes` | enabled | no |
| `billing.partner_users` | enabled | no |
| `billing.payment_provider_routes` | enabled | no |
| `billing.payments` | enabled | no |
| `billing.price_inputs` | enabled | no |
| `billing.provider_coupon_mappings` | enabled | no |
| `billing.provider_price_mappings` | enabled | no |
| `billing.provider_tax_rate_mappings` | enabled | no |
| `billing.referral_attributions` | enabled | no |
| `billing.referral_codes` | enabled | no |
| `billing.referral_touches` | enabled | no |
| `billing.refunds` | enabled | no |
| `billing.seller_entities` | enabled | no |
| `billing.subscription_events` | enabled | no |
| `billing.tax_rules` | enabled | no |
| `billing.trial_eligibility_rules` | enabled | no |
| `billing.trial_grants` | enabled | no |
| `cron.job` | enabled | no |
| `cron.job_run_details` | enabled | no |
| `net._http_response` | disabled | no |
| `net.http_request_queue` | disabled | no |
| `private.firm_access_grants` | enabled | no |
| `private.firm_staff_invitations` | enabled | no |
| `private.platform_job_schedules` | enabled | no |
| `private.platform_operation_receipts` | enabled | no |
| `private.platform_request_buckets` | enabled | no |
| `private.platform_worker_state` | enabled | no |
| `private.po_reset_context` | disabled | no |
| `private.reporting_worker_state` | disabled | no |
| `public.account_workpaper_reconciling_item_events` | enabled | no |
| `public.account_workpaper_reconciling_items` | enabled | no |
| `public.account_workpapers` | enabled | no |
| `public.accountant_journal_exception_events` | enabled | no |
| `public.accountant_journal_exception_reviews` | enabled | no |
| `public.accounting_periods` | enabled | no |
| `public.accounts` | enabled | no |
| `public.action_document_requests` | enabled | no |
| `public.action_notification_preferences` | enabled | no |
| `public.action_notification_refresh_state` | enabled | no |
| `public.action_notifications` | enabled | no |
| `public.advisors_agreements` | enabled | no |
| `public.advisors_appointment_reminders` | enabled | no |
| `public.advisors_appointments` | enabled | no |
| `public.advisors_availability_exceptions` | enabled | no |
| `public.advisors_billing_sku_map` | enabled | no |
| `public.advisors_booking_settings` | enabled | no |
| `public.advisors_catalogue_audit` | enabled | no |
| `public.advisors_catalogue_versions` | enabled | no |
| `public.advisors_chat_rate_limits` | enabled | no |
| `public.advisors_clients` | enabled | no |
| `public.advisors_conversations` | enabled | no |
| `public.advisors_delivery_tasks` | enabled | no |
| `public.advisors_document_requests` | enabled | no |
| `public.advisors_engagements` | enabled | no |
| `public.advisors_leads` | enabled | no |
| `public.advisors_messages` | enabled | no |
| `public.advisors_onboarding_tasks` | enabled | no |
| `public.advisors_portal_invites` | enabled | no |
| `public.advisors_portal_messages` | enabled | no |
| `public.advisors_portal_notifications` | enabled | no |
| `public.advisors_portal_service_requests` | enabled | no |
| `public.advisors_proposals` | enabled | no |
| `public.advisors_public_purchases` | enabled | no |
| `public.advisors_service_plans` | enabled | no |
| `public.advisors_services` | enabled | no |
| `public.advisors_staff` | enabled | no |
| `public.advisors_subscriptions` | enabled | no |
| `public.advisors_work_periods` | enabled | no |
| `public.advisors_working_hours` | enabled | no |
| `public.advisors_workspace_notes` | enabled | no |
| `public.advisors_workspaces` | enabled | no |
| `public.ai_conversation_entries` | enabled | no |
| `public.ai_journal_review_cases` | enabled | no |
| `public.ai_journal_review_events` | enabled | no |
| `public.ai_suggestions` | enabled | no |
| `public.ai_usage_events` | enabled | no |
| `public.app_categories` | enabled | no |
| `public.app_certification_reviews` | enabled | no |
| `public.app_connection_consents` | enabled | no |
| `public.app_install_requests` | enabled | no |
| `public.app_installations` | enabled | no |
| `public.approval_requests` | enabled | no |
| `public.asset_depreciation_entries` | enabled | no |
| `public.asset_depreciation_runs` | enabled | no |
| `public.asset_types` | enabled | no |
| `public.audit_events` | enabled | no |
| `public.bank_account_details` | enabled | no |
| `public.bank_accounts` | enabled | no |
| `public.bank_coding_events` | enabled | no |
| `public.bank_coding_feedback` | enabled | no |
| `public.bank_coding_history` | enabled | no |
| `public.bank_coding_memory_controls` | enabled | no |
| `public.bank_coding_memory_preferences` | enabled | no |
| `public.bank_coding_memory_resets` | enabled | no |
| `public.bank_feed_connections` | enabled | no |
| `public.bank_import_mappings` | enabled | no |
| `public.bank_rules` | enabled | no |
| `public.bank_statement_imports` | enabled | no |
| `public.bank_transactions` | enabled | no |
| `public.bank_transfers` | enabled | no |
| `public.bill_internal_notes` | enabled | no |
| `public.billing_addons` | enabled | no |
| `public.billing_checkouts` | enabled | no |
| `public.billing_cost_inputs` | enabled | no |
| `public.billing_events` | enabled | no |
| `public.billing_features` | enabled | no |
| `public.billing_lifetime_payments` | enabled | no |
| `public.billing_offers` | enabled | no |
| `public.billing_operators` | enabled | no |
| `public.billing_plans` | enabled | no |
| `public.billing_prorations` | enabled | no |
| `public.billing_provider_fees` | enabled | no |
| `public.billing_provider_reconciliations` | enabled | no |
| `public.billing_settings` | enabled | no |
| `public.billing_usage_drafts` | enabled | no |
| `public.break_glass_events` | enabled | no |
| `public.break_glass_grants` | enabled | no |
| `public.budget_approval_events` | enabled | no |
| `public.budget_approval_state` | enabled | no |
| `public.budget_dimension_lines` | enabled | no |
| `public.budget_dimension_revisions` | enabled | no |
| `public.budget_forecast_scenario_events` | enabled | no |
| `public.budget_forecast_scenarios` | enabled | no |
| `public.budget_governance` | enabled | no |
| `public.budget_lines` | enabled | no |
| `public.budget_revisions` | enabled | no |
| `public.budgets` | enabled | no |
| `public.cash_allocation_history` | enabled | no |
| `public.cash_classification_audit` | enabled | no |
| `public.cash_classification_exceptions` | enabled | no |
| `public.cash_classification_policies` | enabled | no |
| `public.cash_inventory_evidence` | enabled | no |
| `public.cash_opening_evidence` | enabled | no |
| `public.coa_apply_events` | enabled | no |
| `public.coa_audit_log` | enabled | no |
| `public.coa_industries` | enabled | no |
| `public.communication_digest_preferences` | enabled | no |
| `public.communication_scheduled_deliveries` | enabled | no |
| `public.communication_send_claims` | enabled | no |
| `public.companies` | enabled | no |
| `public.company_branding` | enabled | no |
| `public.company_closure_requests` | enabled | no |
| `public.company_coa_settings` | enabled | no |
| `public.company_contact_settings` | enabled | no |
| `public.company_currencies` | enabled | no |
| `public.company_invitations` | enabled | no |
| `public.company_members` | enabled | no |
| `public.company_payment_terms` | enabled | no |
| `public.company_reminder_settings` | enabled | no |
| `public.company_subscriptions` | enabled | no |
| `public.company_tax_pack_applications` | enabled | no |
| `public.company_tax_settings` | enabled | no |
| `public.company_workflow_settings` | enabled | no |
| `public.contact_addresses` | enabled | no |
| `public.contact_group_members` | enabled | no |
| `public.contact_groups` | enabled | no |
| `public.contact_interactions` | enabled | no |
| `public.contact_payment_details` | enabled | no |
| `public.contact_people` | enabled | no |
| `public.contact_tag_assignments` | enabled | no |
| `public.contact_tags` | enabled | no |
| `public.contacts` | enabled | no |
| `public.conversion_balance_batches` | enabled | no |
| `public.correction_approval_events` | enabled | no |
| `public.correction_approval_policies` | enabled | no |
| `public.correction_approval_requests` | enabled | no |
| `public.crm_activities` | enabled | no |
| `public.crm_campaigns` | enabled | no |
| `public.crm_lead_events` | enabled | no |
| `public.crm_lead_sources` | enabled | no |
| `public.crm_leads` | enabled | no |
| `public.crm_opportunities` | enabled | no |
| `public.crm_opportunity_stage_history` | enabled | no |
| `public.crm_pipeline_stages` | enabled | no |
| `public.crm_pipelines` | enabled | no |
| `public.crm_settings` | enabled | no |
| `public.crm_territories` | enabled | no |
| `public.currency_decimals` | enabled | no |
| `public.deferral_entries` | enabled | no |
| `public.deferral_schedules` | enabled | no |
| `public.developer_api_usage_daily` | enabled | no |
| `public.developer_applications` | enabled | no |
| `public.developer_oauth_clients` | enabled | no |
| `public.developer_partner_tiers` | enabled | no |
| `public.developer_publishers` | enabled | no |
| `public.developer_usage_alerts` | enabled | no |
| `public.document_attachment_tags` | enabled | no |
| `public.document_attachment_versions` | enabled | no |
| `public.document_attachments` | enabled | no |
| `public.document_email_inboxes` | enabled | no |
| `public.document_folders` | enabled | no |
| `public.document_internal_notes` | enabled | no |
| `public.document_retention_settings` | enabled | no |
| `public.document_review_events` | enabled | no |
| `public.document_reviews` | enabled | no |
| `public.document_sequences` | enabled | no |
| `public.document_share_links` | enabled | no |
| `public.document_storage_cleanup_jobs` | enabled | no |
| `public.document_tags` | enabled | no |
| `public.document_theme_defaults` | enabled | no |
| `public.document_themes` | enabled | no |
| `public.document_tracking_assignments` | enabled | no |
| `public.email_outbox` | enabled | no |
| `public.employee_expense_claims` | enabled | no |
| `public.entitlement_overrides` | enabled | no |
| `public.exchange_rates` | enabled | no |
| `public.expense_approval_delegations` | enabled | no |
| `public.expense_cash_advances` | enabled | no |
| `public.expense_categories` | enabled | no |
| `public.expense_claim_approvals` | enabled | no |
| `public.expense_claim_events` | enabled | no |
| `public.expense_claim_lines` | enabled | no |
| `public.expense_claim_reimbursement_payments` | enabled | no |
| `public.expense_claim_templates` | enabled | no |
| `public.expense_claims` | enabled | no |
| `public.expense_corporate_card_transactions` | enabled | no |
| `public.expense_corporate_cards` | enabled | no |
| `public.expense_exit_settlements` | enabled | no |
| `public.expense_management_settings` | enabled | no |
| `public.expense_mileage_rates` | enabled | no |
| `public.expense_per_diem_rates` | enabled | no |
| `public.expense_petty_cash_floats` | enabled | no |
| `public.expense_receipt_inbox_entries` | enabled | no |
| `public.expense_spending_requests` | enabled | no |
| `public.external_record_links` | enabled | no |
| `public.feature_dependencies` | enabled | no |
| `public.feature_prices` | enabled | no |
| `public.feature_rollouts` | enabled | no |
| `public.firm_app_recommendations` | enabled | no |
| `public.firm_client_assignments` | enabled | no |
| `public.firm_client_links` | enabled | no |
| `public.firm_client_onboarding_steps` | enabled | no |
| `public.firm_client_profile_audit` | enabled | no |
| `public.firm_client_profiles` | enabled | no |
| `public.firm_client_requests` | enabled | no |
| `public.firm_document_request_tracking` | enabled | no |
| `public.firm_engagement_invoice_links` | enabled | no |
| `public.firm_engagement_recurring_links` | enabled | no |
| `public.firm_engagements` | enabled | no |
| `public.firm_members` | enabled | no |
| `public.firm_onboarding_daily_snapshots` | enabled | no |
| `public.firm_onboarding_escalation_events` | enabled | no |
| `public.firm_onboarding_escalation_policies` | enabled | no |
| `public.firm_onboarding_staff_capacity` | enabled | no |
| `public.firm_onboarding_template_steps` | enabled | no |
| `public.firm_service_categories` | enabled | no |
| `public.firm_ui_preferences` | enabled | no |
| `public.firms` | enabled | no |
| `public.fixed_asset_import_refs` | enabled | no |
| `public.fixed_assets` | enabled | no |
| `public.fx_journal_tags` | enabled | no |
| `public.fx_realised_postings` | enabled | no |
| `public.fx_revaluation_runs` | enabled | no |
| `public.hr_applications` | enabled | no |
| `public.hr_asset_assignments` | enabled | no |
| `public.hr_asset_types` | enabled | no |
| `public.hr_attendance_corrections` | enabled | no |
| `public.hr_attendance_logs` | enabled | no |
| `public.hr_audit_events` | enabled | no |
| `public.hr_automation_rules` | enabled | no |
| `public.hr_automation_runs` | enabled | no |
| `public.hr_branches` | enabled | no |
| `public.hr_cases` | enabled | no |
| `public.hr_compensation_changes` | enabled | no |
| `public.hr_departments` | enabled | no |
| `public.hr_designations` | enabled | no |
| `public.hr_employee_documents` | enabled | no |
| `public.hr_employee_profiles` | enabled | no |
| `public.hr_holiday_calendars` | enabled | no |
| `public.hr_holidays` | enabled | no |
| `public.hr_interviews` | enabled | no |
| `public.hr_job_requisitions` | enabled | no |
| `public.hr_leave_balances` | enabled | no |
| `public.hr_leave_requests` | enabled | no |
| `public.hr_leave_types` | enabled | no |
| `public.hr_locations` | enabled | no |
| `public.hr_offboarding_cases` | enabled | no |
| `public.hr_offboarding_tasks` | enabled | no |
| `public.hr_offers` | enabled | no |
| `public.hr_onboarding_cases` | enabled | no |
| `public.hr_onboarding_tasks` | enabled | no |
| `public.hr_onboarding_template_tasks` | enabled | no |
| `public.hr_onboarding_templates` | enabled | no |
| `public.hr_performance_cycles` | enabled | no |
| `public.hr_performance_goals` | enabled | no |
| `public.hr_performance_reviews` | enabled | no |
| `public.hr_position_history` | enabled | no |
| `public.hr_settings` | enabled | no |
| `public.hr_shift_assignments` | enabled | no |
| `public.hr_shift_templates` | enabled | no |
| `public.hr_training_courses` | enabled | no |
| `public.hr_training_enrollments` | enabled | no |
| `public.hr_transfer_requests` | enabled | no |
| `public.inbox_documents` | enabled | no |
| `public.integration_connections` | enabled | no |
| `public.integration_mappings` | enabled | no |
| `public.integration_quality_checks` | enabled | no |
| `public.integration_sync_events` | enabled | no |
| `public.integration_sync_jobs` | enabled | no |
| `public.integration_webhook_deliveries` | enabled | no |
| `public.integration_webhook_subscriptions` | enabled | no |
| `public.issued_document_appearances` | enabled | no |
| `public.journal_auto_reversals` | enabled | no |
| `public.journal_lines` | enabled | no |
| `public.journals` | enabled | no |
| `public.line_tracking_assignments` | enabled | no |
| `public.marketplace_analytics_events` | enabled | no |
| `public.marketplace_app_categories` | enabled | no |
| `public.marketplace_app_versions` | enabled | no |
| `public.marketplace_apps` | enabled | no |
| `public.marketplace_oauth_states` | enabled | no |
| `public.marketplace_rate_events` | enabled | no |
| `public.marketplace_security_alerts` | enabled | no |
| `public.marketplace_security_incidents` | enabled | no |
| `public.marketplace_security_reviews` | enabled | no |
| `public.member_permission_adjustments` | enabled | no |
| `public.messaging_attachments` | enabled | no |
| `public.messaging_audit_events` | enabled | no |
| `public.messaging_conversation_members` | enabled | no |
| `public.messaging_conversations` | enabled | no |
| `public.messaging_invitations` | enabled | no |
| `public.messaging_message_reactions` | enabled | no |
| `public.messaging_message_receipts` | enabled | no |
| `public.messaging_message_versions` | enabled | no |
| `public.messaging_messages` | enabled | no |
| `public.messaging_moderation_events` | enabled | no |
| `public.messaging_notification_preferences` | enabled | no |
| `public.messaging_outbox_events` | enabled | no |
| `public.messaging_record_links` | enabled | no |
| `public.messaging_retention_policies` | enabled | no |
| `public.messaging_settings` | enabled | no |
| `public.messaging_starred_messages` | enabled | no |
| `public.messaging_user_blocks` | enabled | no |
| `public.money_deposit_items` | enabled | no |
| `public.money_document_credit_uses` | enabled | no |
| `public.money_document_lines` | enabled | no |
| `public.money_documents` | enabled | no |
| `public.mrr_movements` | enabled | no |
| `public.organisation_config` | enabled | no |
| `public.organisation_features` | enabled | no |
| `public.organisation_lock_policy` | enabled | no |
| `public.organisation_secrets` | enabled | no |
| `public.payroll_component_types` | enabled | no |
| `public.payroll_employee_payment_details` | enabled | no |
| `public.payroll_employee_salary_lines` | enabled | no |
| `public.payroll_employee_salary_versions` | enabled | no |
| `public.payroll_employees` | enabled | no |
| `public.payroll_pay_schedules` | enabled | no |
| `public.payroll_payment_allocations` | enabled | no |
| `public.payroll_payments` | enabled | no |
| `public.payroll_payslips` | enabled | no |
| `public.payroll_run_employees` | enabled | no |
| `public.payroll_run_lines` | enabled | no |
| `public.payroll_runs` | enabled | no |
| `public.payroll_salary_structure_lines` | enabled | no |
| `public.payroll_salary_structures` | enabled | no |
| `public.payroll_settings` | enabled | no |
| `public.plan_prices` | enabled | no |
| `public.plan_version_limits` | enabled | no |
| `public.plan_versions` | enabled | no |
| `public.platform_alert_events` | enabled | no |
| `public.platform_alert_rules` | enabled | no |
| `public.platform_api_keys` | enabled | no |
| `public.platform_audit` | enabled | no |
| `public.platform_billing_audit` | enabled | no |
| `public.platform_custom_roles` | enabled | no |
| `public.platform_incidents` | enabled | no |
| `public.platform_job_runs` | enabled | no |
| `public.platform_jobs` | enabled | no |
| `public.platform_partners` | enabled | no |
| `public.platform_promotions` | enabled | no |
| `public.platform_records` | enabled | no |
| `public.platform_releases` | enabled | no |
| `public.platform_role_assignments` | enabled | no |
| `public.platform_roles` | enabled | no |
| `public.platform_sandbox_requests` | enabled | no |
| `public.platform_segment_members` | enabled | no |
| `public.platform_segments` | enabled | no |
| `public.platform_service_cases` | enabled | no |
| `public.platform_support_grants` | enabled | no |
| `public.platform_tenant_controls` | enabled | no |
| `public.platform_user_controls` | enabled | no |
| `public.platform_webhook_deliveries` | enabled | no |
| `public.pm_commission_calculations` | enabled | no |
| `public.pm_fee_rules` | enabled | no |
| `public.pm_leases` | enabled | no |
| `public.pm_management_agreements` | enabled | no |
| `public.pm_owner_distributions` | enabled | no |
| `public.pm_owner_reserves` | enabled | no |
| `public.pm_owner_statement_lines` | enabled | no |
| `public.pm_owner_statements` | enabled | no |
| `public.pm_owners` | enabled | no |
| `public.pm_portal_access` | enabled | no |
| `public.pm_properties` | enabled | no |
| `public.pm_property_ownership` | enabled | no |
| `public.pm_rent_charges` | enabled | no |
| `public.pm_rent_schedules` | enabled | no |
| `public.pm_reservation_financial_lines` | enabled | no |
| `public.pm_reservations` | enabled | no |
| `public.pm_security_deposits` | enabled | no |
| `public.pm_settings` | enabled | no |
| `public.pm_statement_snapshots` | enabled | no |
| `public.pm_tenants` | enabled | no |
| `public.pm_units` | enabled | no |
| `public.portal_bank_change_requests` | enabled | no |
| `public.portal_files` | enabled | no |
| `public.portal_memberships` | enabled | no |
| `public.portal_messages` | enabled | no |
| `public.portal_notifications` | enabled | no |
| `public.portal_payment_events` | enabled | no |
| `public.portal_payment_intents` | enabled | no |
| `public.portal_po_acknowledgements` | enabled | no |
| `public.portal_rate_events` | enabled | no |
| `public.portal_reminder_log` | enabled | no |
| `public.portal_settings` | enabled | no |
| `public.portal_staff_alerts` | enabled | no |
| `public.portal_supplier_submissions` | enabled | no |
| `public.pos_cash_movements` | enabled | no |
| `public.pos_location_access` | enabled | no |
| `public.pos_refunds` | enabled | no |
| `public.pos_register_sessions` | enabled | no |
| `public.pos_registers` | enabled | no |
| `public.pos_sale_lines` | enabled | no |
| `public.pos_sale_payments` | enabled | no |
| `public.pos_sales` | enabled | no |
| `public.practice_tasks` | enabled | no |
| `public.price_change_log` | enabled | no |
| `public.product_categories` | enabled | no |
| `public.product_customer_price_list_defaults` | enabled | no |
| `public.product_price_list_discount_rules` | enabled | no |
| `public.product_price_list_items` | enabled | no |
| `public.product_price_list_rules` | enabled | no |
| `public.product_price_lists` | enabled | no |
| `public.products` | enabled | no |
| `public.profiles` | enabled | no |
| `public.projects` | enabled | no |
| `public.public_api_scopes` | enabled | no |
| `public.purchase_bill_lines` | enabled | no |
| `public.purchase_bills` | enabled | no |
| `public.purchase_credit_allocations` | enabled | no |
| `public.purchase_credit_note_lines` | enabled | no |
| `public.purchase_credit_notes` | enabled | no |
| `public.purchase_expenses` | enabled | no |
| `public.purchase_order_events` | enabled | no |
| `public.purchase_order_lines` | enabled | no |
| `public.purchase_order_receipts` | enabled | no |
| `public.purchase_orders` | enabled | no |
| `public.purchase_requisitions` | enabled | no |
| `public.reconciliation_links` | enabled | no |
| `public.reconciliation_review_cases` | enabled | no |
| `public.reconciliation_review_events` | enabled | no |
| `public.reconciliation_session_lines` | enabled | no |
| `public.reconciliation_sessions` | enabled | no |
| `public.recurring_bills` | enabled | no |
| `public.recurring_generation_runs` | enabled | no |
| `public.recurring_journal_occurrences` | enabled | no |
| `public.recurring_journal_templates` | enabled | no |
| `public.recurring_occurrences` | enabled | no |
| `public.recurring_schedule_exceptions` | enabled | no |
| `public.recurring_schedules` | enabled | no |
| `public.recurring_template_versions` | enabled | no |
| `public.recurring_templates` | enabled | no |
| `public.report_comments` | enabled | no |
| `public.report_deliveries` | enabled | no |
| `public.report_grants` | enabled | no |
| `public.report_model_versions` | enabled | no |
| `public.report_models` | enabled | no |
| `public.report_open_events` | enabled | no |
| `public.report_packs` | enabled | no |
| `public.report_saved_views` | enabled | no |
| `public.report_schedules` | enabled | no |
| `public.role_permissions` | enabled | no |
| `public.sales_credit_allocations` | enabled | no |
| `public.sales_credit_note_lines` | enabled | no |
| `public.sales_credit_notes` | enabled | no |
| `public.sales_invoice_lines` | enabled | no |
| `public.sales_invoices` | enabled | no |
| `public.sales_orders` | enabled | no |
| `public.sales_quote_lines` | enabled | no |
| `public.sales_quotes` | enabled | no |
| `public.sales_receipt_allocations` | enabled | no |
| `public.sales_receipts` | enabled | no |
| `public.sales_recurring_invoice_lines` | enabled | no |
| `public.sales_recurring_invoices` | enabled | no |
| `public.settings_change_log` | enabled | no |
| `public.supplier_payment_allocations` | enabled | no |
| `public.supplier_payments` | enabled | no |
| `public.tax_codes` | enabled | no |
| `public.tax_gl_review_events` | enabled | no |
| `public.tax_gl_review_sessions` | enabled | no |
| `public.tax_rates` | enabled | no |
| `public.tax_return_lines` | enabled | no |
| `public.tax_returns` | enabled | no |
| `public.tracking_categories` | enabled | no |
| `public.tracking_options` | enabled | no |
| `public.transaction_correction_batches` | enabled | no |
| `public.transaction_correction_items` | enabled | no |
| `public.usage_counters` | enabled | no |
| `public.user_ui_preferences` | enabled | no |
| `realtime.messages` | enabled | no |
| `realtime.messages_2026_11_23` | disabled | no |
| `realtime.messages_2026_11_24` | disabled | no |
| `realtime.messages_2026_11_25` | disabled | no |
| `realtime.messages_2026_11_26` | disabled | no |
| `realtime.messages_2026_11_27` | disabled | no |
| `realtime.messages_2026_11_28` | disabled | no |
| `realtime.messages_2026_11_29` | disabled | no |
| `realtime.schema_migrations` | disabled | no |
| `realtime.subscription` | disabled | no |
| `storage.bucket_lifecycle_states` | enabled | no |
| `storage.buckets` | enabled | no |
| `storage.buckets_analytics` | enabled | no |
| `storage.buckets_vectors` | enabled | no |
| `storage.lifecycle_abandoned_artifacts` | enabled | no |
| `storage.migrations` | enabled | no |
| `storage.objects` | enabled | no |
| `storage.s3_multipart_uploads` | enabled | no |
| `storage.s3_multipart_uploads_parts` | enabled | no |
| `storage.vector_indexes` | enabled | no |
| `supabase_migrations.schema_migrations` | disabled | no |
| `vault.secrets` | disabled | no |

### Function, trigger and policy inventory summary

Live catalog counts: public 1,019 functions (870 SECURITY DEFINER), private 280 (194 SECURITY DEFINER), billing 61 (19 SECURITY DEFINER); public 283 noninternal triggers; billing 19 triggers; policies public 944, private 1, cron 2, storage 12. RLS/no-policy count across schemas: 109 by catalog; Supabase security advisor lists 83 findings.
  
Critical role/data objects include `public.platform_roles`, `platform_custom_roles`, `platform_role_assignments`, `company_members`, `firm_members`, `firm_client_links`, `platform_audit`, `platform_support_grants`, `company_subscriptions`, `billing_checkouts`, `organisation_features`, and `entitlement_overrides`. Key server functions include `platform_context`, `platform_role`, `private.require_platform`, `winning_entitlements`, `has_company_permission`, `manage_practice_client`, `billing_webhook_receive`, and `billing_webhook_claim`.

Security/performance/health advisors at audit time:
- Security: 27 anon-executable SECURITY DEFINER RPC warnings; 764 authenticated-executable SECURITY DEFINER RPC warnings; leaked-password protection disabled; 83 RLS/no-policy findings.
- Performance: 915 unindexed FK findings, 31 RLS init-plan findings, 429 unused indexes, 51 multiple permissive-policy findings.
- Health: `/functions/v1/reporting-worker` returned 5xx on 5/5 recent requests across the two five-minute windows.
- These are review findings. A SECURITY DEFINER warning is not itself proof of a vulnerability; review each function's privilege checks and actual behavior.

### Access model evidence

- `public.platform_role()` returns a role only for MFA `aal2` and an active Auth session; platform RPCs use `private.require_platform(permission)`.
- Platform control plane is in `supabase/migrations/20261030144257_superadmin_control_plane.sql`; hardening/MFA is in `20261030145148_superadmin_transactional_billing_and_hardening.sql`.
- `platform_audit` has append-only mutation protection. Support uses expiring, reason-required `platform_support_grants`; no application-level impersonation or `view_as_tenant` route was found.
- Companies/firms use server-side permission checks and RLS. The firm list function validates current `firm_members` membership.
- Source scan found the service-role key reference in `src/integrations/supabase/client.server.ts`, which is server-only. Payment keys are read by server modules. No client-component source matches were found. This was not a deployed bundle scan.
- Live counts queried without identities: two platform-owner rows; zero app audit actions matching login; zero rows in `company_subscriptions`.

## Billing, price book, checkout, and entitlement status

| Requirement | Evidence | Status |
|---|---|---|
| Plan audiences | `billing_plans.audience`, `plan_versions.audience` | Exists for business/firm audience. |
| Trials and past-due grace | `trial_days`, `past_due_grace_days`, trial timestamps/status | Configured in schema/functions; full notifications/transitions not verified. |
| Plan versioning and prices | `billing_plans`, `plan_versions`, `plan_prices`, `plan_version_limits` | Exists; confirm grandfathering behavior in focused tests. |
| Per-feature add-on prices | `billing_features`, `feature_prices`, entitlement quote/checkout | Exists. |
| Currency/tax | country pricing, billing tax settings and quote code | Configurable; live tax/provider compliance not verified. |
| Stripe / Razorpay | `src/lib/billing/providers/*.server.ts` and `billing.functions.ts` | Real hosted Checkout code for existing companies. Secret presence/mode unknown; no live payment attempted. Advisors Razorpay is separate. |
| Webhooks | `src/lib/billing/webhooks.ts`, `signatures.ts`, DB receive/claim RPCs | Raw-body signature validation and durable event deduplication exist; live deliveries unverified. |
| Existing-company checkout | `createCheckoutFor` validates company UUID and requires `billing.manage` | Exists; requires logged-in user/company first. |
| New buyer provisioning | no public business/firm checkout path that creates tenant, owner and invite was found | Missing; current order is signup → onboarding/company → checkout. |
| Trial expiration behavior | `trialing`, `active`, `past_due`, `cancelled`, `expired`, `complimentary`, `paused` statuses | Partial; read-only fallback and email steps need end-to-end proof. |
| Invoice access | invoice tables, billing UI and invoice functions | Present in code/schema; downloadable invoice flow not tested. |

## Entitlements and start-month gap

- Per-tenant feature state exists in `organisation_features`, `entitlement_overrides`, `feature_rollouts`; the DB `winning_entitlements` function is described in source as its enforcement copy.
- There is no single entitlement middleware around every server function. Phase 1+ should inventory protected reads/writes and test actual RPC/RLS denial.
- Migration `20261102160000_subscription_start_cohorts.sql` adds `company_subscriptions.started_at`, writes on INSERT only, and creates `platform_subscription_cohorts()`. It leaves historical rows null by design and has no backfill.
- Live `company_subscriptions` currently has zero rows. The cohort function counts null historical start dates as `unknownStart` and groups non-null starts by UTC month.
- Source readers include the DB function in that migration, the platform subscription-cohort loader/UI, and `src/lib/platform/subscription-cohorts.ts`; tests assert old rows aren't assigned a month from last update. Search hits in generated Supabase types are type definitions only.
- The migration is present in the hosted ledger despite its stale “Not applied” source comment. No source migration was edited.

## Impersonation and audit

- No generic tenant impersonation or `view_as_tenant` flow exists.
- Scoped, time-limited, reason-required `platform_support_grants` and `platform_support_read` exist. This is support data access, not write impersonation.
- Platform changes are append-only audited. The live platform audit contains zero login actions; an explicit platform owner login event is missing.
- No user email, company name, secret or subscription record was queried for this audit.

## Tests, lint, verification

Commands were run without source edits or migrations:

| Check | Result |
|---|---|
| `npm.cmd run typecheck` | Passed. |
| `npm.cmd run lint` | Failed on the current checkout: 2,749 Prettier-format ESLint errors, 0 warnings, across many existing files (including `e2e/billing/billing.spec.ts`, `scripts/build-brand-assets.mjs`, and broad `src` paths). No autofix was run. |
| Vitest, Playwright, database tests | Not run in this read-only audit. |
| GitHub checks on main baseline | Two Vercel contexts failed and link to a plan-upgrade page. No deployment was verified. |
| Supabase | Read-only migration, catalog, data-count, and advisory queries only. |

## Requirement matrix

| Requirement | Existing evidence | Status | Reuse / action |
|---|---|---|---|
| Phase 1 — owner role/login/MFA/bootstrap/audit | Role table, MFA DB gate; no owner CLI or login audit | Partial | Reuse roles/guards; add fail-closed bootstrap and login audit; test public signup cannot assign platform role. |
| Phase 2 — role routing/guards | Shared auth, safe redirect, client session gate, server permission/RLS | Partial | Extend landing by DB roles; retain server authorization; test cross-role denials. |
| Phase 3 — plans/trials/price book/start month | Audience, prices, trial settings, versions and features exist; no historical start backfill | Partial | Reuse pricebook; confirm grandfathering; resolve migration drift before appended backfill. |
| Phase 4 — checkout/webhooks/trials | Stripe/Razorpay, signatures, dedupe, trial and invoice schema | Partial | Reuse providers; test full lifecycle, idempotency and notifications. |
| Phase 5 — post-purchase access | Signup/onboarding and company create exist; checkout requires an existing company | Missing | Add buyer-to-tenant/owner invite provisioning, plan/entitlements and accepted-client link. |
| Phase 6 — owner console/visibility | Platform console, tenant controls, feature flags, support grants and audit | Partial | Extend login audit and visibility controls; any view-as requires read-only-by-default audited design. |
| Phase 7 — partner model | Firm, client, staff, billing, analytics and client work surfaces | Partial | Extend pricing/discount tiers and usage reporting; enforce per-client staff scope and billing boundaries. |
| Phase 7A — partner rules (added by owner) | Firm links, members, client assignments, subscriptions/RLS foundations | Not yet proven | Client-owned read-only during firm suspension; staff-specific client+role grants; immediate revoke/retention; firm-paid seats; explicit payer. Tests: two staff × two clients and suspension/read-only. |
| Phase 7B — market patterns (added by owner) | Firm activity/request surfaces exist; schema payer and client-facing access logs unproven | Not yet proven | Client-visible access logs; client approval of elevated roles; payer switch continuity; decision record for seats; multi-client switching. Add denial/transition tests. |
| Phase 8 — legal/docs | `docs/local-test-guide.md`, `docs/access-matrix.md`, `docs/decisions.md` absent; product domain is external to this checkout | Missing/partial | Add local guide, access matrix and decision record; identify the authoritative web repo before legal edits. |

## Added Phase 7A acceptance requirements

1. Client owns client data. Firm or platform suspension must never prevent the client from viewing/exporting its own records read-only.
2. A client dispute/suspension retains read-only access until resolution.
3. Firm owner grants each staff member a specific client and per-client role. Staff see no clients beyond those grants. Test two staff and two client businesses.
4. Client disconnect ends firm access immediately. Retention of any firm-held copy must follow an explicitly agreed retention period.
5. Firm staff seats do not consume a client's user limit; bill staff seats to the firm.
6. Store payer on each subscription as firm or client; do not charge a client for firm seats without explicit firm agreement.
7. Partner tier counts only active paid client subscriptions, excludes trials, and considers a client active only after login within 120 days; owner controls tier discount.

## Added Phase 7B acceptance requirements

1. Client sees which firm staff accessed books, when, and modules accessed.
2. Firm requests for elevated client roles require client approval and audit; firm cannot self-grant. Add tests.
3. Billing payer switch between firm/client preserves client read access throughout. Test transition.
4. Document firm seat rules in `docs/decisions.md`; firm staff never need a paid client license to join.
5. Firm staff switch among all and only their authorized clients without logging out. Test with two clients.

## Manual checklist for implementation

Use dedicated fixture organisations and three isolated identities: platform owner, direct business owner and firm user; add two clients and two staff for partner-scope tests.

- Confirm role landings and account access; business/firm users are denied `/platform`.
- Suspend firm/dispute and verify the client can still view/export read-only.
- Verify staff 1 sees client A only and staff 2 sees client B only.
- Disconnect client link and verify firm access stops immediately.
- Approve/reject elevated firm request as client; verify firm cannot approve its own request.
- Review client-visible access log fields (identity, timestamp, modules).
- Switch payer in both directions; preserve client access and bill firm seats to firm.
- Check tier excludes trial and 120-day-inactive clients.
- Review desktop/tablet/mobile and keyboard behavior for UI changes.

## Complete local migration inventory

Each row lists the local migration, its leading SQL comment (or filename when no comment exists), and literal CREATE-object counts grouped by type. Dynamic SQL may create objects not visible to this static count.

| Migration file | Purpose/comment | Literal CREATE counts |
|---|---|---|
| `20260930110603_f115456e-7584-4af4-8557-c781066d5890` | 20260930110603_f115456e-7584-4af4-8557-c781066d5890 | function:2,policy:3,table:1,trigger:2 |
| `20260930110624_7906220f-ddec-4cf7-88c9-f18c583740bc` | 20260930110624_7906220f-ddec-4cf7-88c9-f18c583740bc | — |
| `20261003014249_deb63ade-3025-4945-88ed-b76da31f1a84` | Companies | function:9,index:2,policy:12,table:5,trigger:5,type:2 |
| `20261003014326_67ade68a-94c9-41f8-8478-04165b345960` | 20261003014326_67ade68a-94c9-41f8-8478-04165b345960 | function:1,policy:1 |
| `20261019120000_permissions_expand_and_indexes` | Additive foundation hardening (non-destruc | index:6 |
| `20261019140000_accounting_engine` | LinkBooks accounting engine (Phase 3 found | extension:1,function:11,index:12,policy:19,table:9,trigger:2,type:6 |
| `20261019160000_purchases_module` | Purchases module (bills, expenses, payment | index:9,policy:19,table:14,type:5 |
| `20261019180000_sales_banking_contacts` | Sales, Banking extensions, Contacts policy | index:8,policy:47,table:16,type:2 |
| `20261019190000_reports_tax_accountant` | Tax masters, firm/client, tax settings ext | function:3,index:4,policy:16,table:5,type:2 |
| `20261019200000_cross_cutting_settings_fx_demo` | Cross-cutting: org settings extras, docume | function:9,index:1,policy:8,table:4,trigger:2 |
| `20261019210000_ai_assistant` | AI Accounting Assistant: suggestions store | function:2,index:2,policy:4,table:2 |
| `20261019220000_demo_company_guards` | Demo Company guards: cannot flip is_demo o | function:1,trigger:1 |
| `20261019230000_extended_coa_and_demo_period` | Extended Chart of Accounts (current / non- | function:3 |
| `20261019240000_products_search_settings` | Products catalogue, workflow settings, sto | function:1,index:3,policy:8,table:2,type:1 |
| `20261020200000_industry_coa_library` | Industry CoA library: settings, tracking d | function:1,index:5,policy:9,table:5,trigger:1 |
| `20261020210000_reports_centre_integrity` | Reports Centre: demote unposted volume she | index:1,policy:1,table:1 |
| `20261020220000_banking_workspaces` | Banking workspaces: exclude audit fields,  | index:2,policy:2,table:1 |
| `20261020230000_contacts_centre` | Contact Management Centre: extended fields | index:5,policy:14,table:7 |
| `20261020240000_settings_governance_dimensions` | Settings governance: reporting dimensions, | index:5,policy:4,table:2 |
| `20261020250000_tax_multi_country` | Multi-country tax framework: treatments, p | function:2,index:1,policy:2,table:1 |
| `20261020260000_bills_new_upgrade` | New Bill upgrade: transaction address, ter | index:3,policy:4,table:2 |
| `20261021120000_bill_workspace_prefs` | Per-user / per-organisation UI preferences | index:1,policy:1,table:1 |
| `20261021140000_bills_workspace_approval` | Bills workspace: awaiting_approval status  | index:1 |
| `20261022125237_settings_centre_foundation` | Settings Centre foundation: typed config d | function:9,index:2,policy:16,table:5,trigger:1 |
| `20261022173000_recurring_transactions_v2_foundation` | Recurring Transactions Engine V2 — Stage 1 | function:2,index:3,policy:9,table:5,type:4 |
| `20261022180000_recurring_v2_stages_2_8` | Recurring Transactions V2 — Stages 2–8 (sc | index:3,policy:1,table:1 |
| `20261022210000_create_new_documents` | Create New documents: cash sales, refunds, | index:1,policy:14,table:7 |
| `20261022230000_chart_of_accounts_enterprise` | Enterprise chart fields. Does not replace  | function:2,index:2,policy:1,table:1,trigger:2 |
| `20261022231000_chart_import_copy` | Transactional chart import and firm copy.  | function:2 |
| `20261023170000_ledger_write_path_hardening` | Ledger write-path hardening (from independ | function:4,policy:2,trigger:1 |
| `20261023190000_money_document_void_and_credit_uses` | Money documents: void support and credit c | index:1,policy:2,table:1 |
| `20261024100000_purchases_document_prefixes` | Workstream A (P-12): purchase documents mu | function:1 |
| `20261024100100_replace_purchase_bill_lines` | Workstream A (P-08): replace all lines of  | function:1 |
| `20261024100200_merge_contacts_rpc` | Workstream A (C-01): merge two contacts in | function:1 |
| `20261024110000_reverse_journal_on_date` | Workstream B (Sales / AR): reversal with a | function:1 |
| `20261024110100_sales_ar_columns` | Workstream B (Sales / AR): additive column | index:6 |
| `20261024110200_sales_ar_receipt_credit_rpcs` | Workstream B (Sales / AR): atomic receipt  | function:5 |
| `20261024110300_sales_ar_correction_rpcs` | Workstream B (Sales / AR): correction tool | function:6 |
| `20261024110400_sales_ar_save_document_rpc` | Workstream B (Sales / AR): atomic draft sa | function:1 |
| `20261024110500_sales_recurring_delete` | Sales / AR: delete a recurring invoice tem | function:1 |
| `20261024110600_sales_posted_document_guard` | Sales / AR (AR-02, partial): posted docume | function:2,trigger:2 |
| `20261024120000_bank_matching_schema` | Workstream C (Banking) — schema foundation | index:9,policy:5,table:2 |
| `20261024120100_bank_match_unmatch_rpcs` | Workstream C (Banking) — atomic match / un | function:3 |
| `20261024120200_bank_reconciliation_rpcs` | Workstream C (Banking) — tick-based statem | function:3 |
| `20261024120300_bank_transfer_and_coding_rpcs` | Workstream C (Banking) — atomic transfers  | function:2 |
| `20261024130000_reporting_ledger_rpcs` | Workstream D: ledger numbers computed in t | function:4 |
| `20261024130100_fiscal_periods_and_archive` | Workstream D: financial-year coverage (AC- | function:4 |
| `20261024130200_tax_returns` | Workstream D: VAT/GST returns (TX-01). | function:7,index:2,policy:2,table:2,trigger:2 |
| `20261025090000_ac_foundation` | Wave 2 E (accounting core) foundation. Add | function:4 |
| `20261025100000_conversion_balances` | AC-02: conversion date + opening balances  | function:4,index:2,policy:1,table:1,trigger:3 |
| `20261025110000_fx_realised_unrealised` | Wave 2 / E: foreign-currency gains and los | function:17,index:3,policy:4,table:4,trigger:6 |
| `20261025120000_account_merge_dated` | Wave 2 / E: AC-08 account merge with histo | function:3 |
| `20261025130000_ledger_health_check` | Wave 2 / E: ledger health check. | function:1 |
| `20261025200000_document_branding_fields` | Wave 2-F: document branding fields (addres | — |
| `20261025200100_company_documents_storage` | Wave 2-F: company documents (attachments)  | function:3,index:1,policy:7,trigger:1 |
| `20261025200200_email_outbox_reminders` | Wave 2-F: e-mail send history and invoice  | function:1,index:2,policy:3,table:2 |
| `20261025200300_document_share_links` | Wave 2-F: revocable read-only online invoi | function:3,index:1,policy:1,table:1 |
| `20261025300000_ops_sales_ar_lockdown` | Wave 2 H (operations) — AR-02 remainder: p | function:6,trigger:11 |
| `20261025300100_ops_money_documents_rpcs` | Wave 2 H (operations): atomic money docume | function:9,index:1 |
| `20261025300200_ops_purchases_payments_fx` | Wave 2 H (ops) — purchases: atomic supplie | function:6,index:3,trigger:1 |
| `20261025300300_ops_recurring_journals` | Wave 2 H (ops) — recurring manual journals | function:4 |
| `20261025300400_ops_banking` | Wave 2 H (ops) — banking leftovers. | function:6,policy:1,table:1 |
| `20261025300500_ops_projects` | Projects: tag document lines and bank tran | function:3,index:6 |
| `20261025310000_fx_inline_guard` | Integration of wave 2 E (separate realised | function:2 |
| `20261025400000_report_rpcs` | Wave 2 / I (reporting & planning): report  | function:8 |
| `20261025400100_budgets` | Wave 2 / I: budgets. | function:3,index:4,policy:2,table:2 |
| `20261025400200_journal_source_types_fixed_assets` | Wave 2 / I: journal source types for fixed | — |
| `20261025400300_fixed_assets` | Wave 2 / I: fixed-asset register, monthly  | function:10,index:5,policy:4,table:4 |
| `20261025400400_document_notes_and_activity` | Internal notes and activity for every docu | function:5,index:1,policy:2,table:1,trigger:1 |
| `20261029101434_mfa_aal2_rls_enforcement` | Enforce two-step verification at the datab | function:2,schema:1 |
| `20261029160000_document_folders` | Additive document folders. Existing docume | function:1,index:3,policy:4,table:1,trigger:1 |
| `20261030120000_subscriptions` | Organisation subscriptions: plans, promo c | function:8,index:2,policy:13,table:7,trigger:5 |
| `20261030140000_billing_platform` | Extends the subscription sketch into versi | function:13,index:1,policy:11,table:10,trigger:2 |
| `20261030144257_superadmin_control_plane` | Additive control plane. No customer financ | function:24,index:8,policy:1,schema:1,table:7,trigger:2 |
| `20261030145148_superadmin_transactional_billing_and_hardening` | Follow-up from transactional integration t | function:6,index:1,table:1 |
| `20261030145424_superadmin_scoped_controls_and_operations` | 20261030145424_superadmin_scoped_controls_and_operations | function:6 |
| `20261030145608_superadmin_staff_account_controls` | 20261030145608_superadmin_staff_account_controls | — |
| `20261030150225_superadmin_firm_client_authorization` | 20261030150225_superadmin_firm_client_authorization | function:3,policy:1,trigger:1 |
| `20261030150410_superadmin_action_permissions_and_exports` | Individual action permissions coexist with | function:3 |
| `20261030150724_superadmin_scoped_company_navigation` | Customer navigation and UI hints include e | function:2 |
| `20261030151219_superadmin_explicit_scoped_accounting_read` | 20261030151219_superadmin_explicit_scoped_accounting_read | function:1 |
| `20261030153000_fixed_asset_register_csv_import` | Fixed Asset register CSV import: atomic, a | function:1,index:2,policy:1,table:1 |
| `20261031103702_communication_operations` | Communications operations: rate limits and | function:1,index:1,policy:4,table:2 |
| `20261031123000_member_access_controls` | Member access: duty roles stay the baselin | extension:1,function:10,policy:1,table:1,trigger:1 |
| `20261031130000_communication_delivery_audit` | Self-owned communication history; delivery | policy:1 |
| `20261031160000_action_notifications_foundation` | Smart Action Center: additive notification | function:1,index:2,policy:1,table:1 |
| `20261031161000_action_notification_publisher` | Trusted producer API. Only service_role ma | function:1 |
| `20261031162000_action_notification_workflows` | Action Center workflows. Adds only additiv | function:6,index:4,policy:2,table:2 |
| `20261031163000_action_notification_delivery` | Notification delivery and document request | function:1,trigger:1 |
| `20261031164000_action_notification_preferences` | Per-user, per-company preference for OPTIO | policy:2,table:1 |
| `20261031165000_action_notification_state_hardening` | Final permission hardening: reading and ac | function:1 |
| `20261031170000_customer_supplier_portals` | Customer and supplier portals. | function:12,index:11,table:14 |
| `20261031170100_portal_access_and_reads` | Portal invitations, settings, and customer | function:13 |
| `20261031170200_portal_payments_supplier_files` | Portal payments, supplier submissions, fil | function:7 |
| `20261031170300_portal_supplier_documents` | Supplier submissions, documents, messages, | function:19 |
| `20261031195000_communication_scheduled_digests` | Scheduled, opt-in email digests. Access to | function:2,index:1,policy:1,table:1 |
| `20261101032734_mfa_policies_refresh` | Extend the aal2 restrictive policy (202610 | — |
| `20261101105743_practice_workflows` | Practice work is operational evidence, nev | function:6,index:6,policy:2,table:2 |
| `20261101110316_practice_workflow_hardening` | Harden direct RPC calls and retain indepen | function:2,policy:1 |
| `20261101111104_practice_access_write_boundary` | All firm grant changes must include proven | — |
| `20261101112845_transaction_corrections` | Additive, line-specific GL corrections. Ne | function:7,index:9,policy:4,table:2,trigger:1,view:1 |
| `20261101113351_transaction_correction_guards` | Keep the seeded rounding account outside o | function:2 |
| `20261101115232_transaction_correction_search_amounts` | Filters use exact base-currency ledger val | function:1,view:1 |
| `20261101121500_advanced_transaction_search` | Search all ledger account classes. Correct | function:7,view:1 |
| `20261101121945_correction_source_references` | Keep correction preview and evidence align | view:1 |
| `20261101124107_document_themes_and_issued_appearance` | Document appearance is separate from the i | function:10,index:3,policy:2,table:3 |
| `20261101124516_document_theme_layout_controls` | 20261101124516_document_theme_layout_controls | function:4,index:1 |
| `20261101124922_document_theme_platform_guards` | Use the same tenant/maintenance/subscripti | function:2,trigger:2 |
| `20261101125137_document_theme_column_widths` | 20261101125137_document_theme_column_widths | function:1 |
| `20261102042056_reporting_ecosystem` | Reporting: additive metadata, explicit gra | function:15,index:9,policy:11,table:6,trigger:2 |
| `20261102043511_reporting_policy_insert_visibility` | Owner predicate is evaluated directly so I | policy:1 |
| `20261102044934_reporting_review_and_scheduler` | Review corrections and verifiable database | extension:2,function:5,policy:1,table:2,trigger:1 |
| `20261102050738_reporting_schedule_integrity_review` | Author review: stable calendar recurrence, | function:5 |
| `20261102052717_reporting_pack_pagination_counts` | Invoker semantics retain the caller's tena | function:1 |
| `20261102053436_reporting_rls_and_reference_indexes` | Cover reporting references used by foreign | index:21 |
| `20261102054954_reporting_calculated_columns` | Calculated columns contain no independentl | function:1 |
| `20261102060542_reporting_delivery_confirmation_queue` | Fair confirmation polling: old unresolved  | function:1,index:1 |
| `20261102120000_entitlement_price_book` | Entitlement overrides, feature price book  | function:10,index:3,table:5,trigger:1 |
| `20261102130000_rollout_enforcement` | Enforce feature rollouts in winning_entitl | function:3 |
| `20261102140000_mrr_movements` | Historical MRR movements for the control c | function:2,index:1,policy:1,table:1,trigger:1 |
| `20261102150000_mrr_reconciliation` | Read-only comparison of the latest stored  | function:2 |
| `20261102160000_subscription_start_cohorts` | Store a subscription start only when the r | function:2,trigger:1 |
| `20261102170000_feature_dependency_read` | Allow signed-in users to read the feature  | policy:1 |
| `20261102180000_definer_anon_execute` | READY-TO-APPLY. Not applied to the hosted  | — |
| `20261102180100_function_search_path` | READY-TO-APPLY. Not applied to the hosted  | — |
| `20261102180101_reporting_catalogue_entitlements` | The reporting suite remains included; no e | function:4,trigger:3 |
| `20261102180102_reporting_revoke_while_frozen` | Revocation narrows access and must remain  | function:1 |
| `20261102180103_reporting_access_history` | User-owned navigation metadata. This never | function:2,index:3,policy:2,table:1 |
| `20261102180104_reporting_activity_filter_context` | Retain supported URL filters so recent GL, | function:2 |
| `20261102180105_reporting_posted_ledger_filters` | Bounded literal predicates on actual poste | function:5 |
| `20261102180106_reporting_standard_statement_capture` | Capture every requested standard-statement | function:3 |
| `20261102180107_reporting_statement_percentage_basis` | Support documented income/expense/row and  | function:1 |
| `20261102190000_break_glass` | READY-TO-APPLY. Not applied. Break-glass r | function:5,table:2 |
| `20261102200000_platform_api_keys` | READY-TO-APPLY. Not applied. Hash-only pla | function:1,table:1 |
| `20261102210000_webhook_deliveries` | READY-TO-APPLY. Not applied. Delivery outc | function:1,table:1 |
| `20261102220000_company_closure` | READY-TO-APPLY. Not applied. Closure archi | function:2,table:1 |
| `20261102230000_ai_governance` | READY-TO-APPLY. Not applied. Reads the exi | function:1 |
| `20261102240000_customer_360` | READY-TO-APPLY. Not applied. Business iden | function:1 |
| `20261102250000_global_search` | READY-TO-APPLY. Not applied. Business and  | function:1 |
| `20261102260000_segments` | READY-TO-APPLY. Not applied. Platform segm | function:2,table:2 |
| `20261102270000_alert_rules` | READY-TO-APPLY. Not applied. A missing obs | function:1,table:1 |
| `20261102280000_job_console` | READY-TO-APPLY. Not applied. Records a que | function:1,table:1 |
| `20261102290000_incidents` | READY-TO-APPLY. Not applied. Incident stat | function:3,table:2 |
| `20261102300000_service_desk` | READY-TO-APPLY. Not applied. A service cas | function:1,table:1 |
| `20261102310000_partners` | READY-TO-APPLY. Not applied. Partner direc | function:1,table:1 |
| `20261102320000_config_promotion` | READY-TO-APPLY. Not applied. Records a pro | function:2,table:1 |
| `20261102330000_sandbox_requests` | READY-TO-APPLY. Not applied. Records a san | function:1,table:1 |
| `20261102340000_provider_fees` | READY-TO-APPLY. Not applied. Stores a fee  | function:1,table:1 |
| `20261102350000_webhook_delivery_record` | READY-TO-APPLY. Not applied. Records a del | function:1 |
| `20261102360000_lifetime_value` | READY-TO-APPLY. Not applied. Subscription  | function:2,table:1 |
| `20261102370000_usage_drafts` | READY-TO-APPLY. Not applied. Saves an over | function:1,table:1 |
| `20261102380000_promotion_presentation` | READY-TO-APPLY. Not applied. An approval c | function:1 |
| `20261102390000_usage_draft_guard` | READY-TO-APPLY. Not applied. Rejects a dra | function:1 |
| `20261102400000_usage_draft_quantity` | READY-TO-APPLY. Not applied. Included usag | function:1 |
| `20261102410000_provider_reconciliation` | READY-TO-APPLY. Not applied. Stores a comp | function:1,table:1 |
| `20261102420000_proration_store` | READY-TO-APPLY. Not applied. Stores a calc | function:1,table:1 |
| `20261102430000_break_glass_expire_audit` | READY-TO-APPLY. Not applied. Expiry writes | function:1 |
| `20261102440000_company_exists_guards` | READY-TO-APPLY. Not applied. A break-glass | function:2 |
| `20261102450000_provider_fee_within_gross` | READY-TO-APPLY. Not applied. A stored fee  | function:1 |
| `20261102460000_segment_duplicate_guard` | READY-TO-APPLY. Not applied. A duplicate s | function:2 |
| `20261102470000_webhook_delivery_before` | READY-TO-APPLY. Not applied. Updating a de | function:1 |
| `20261102480000_lifetime_payment_duplicate` | READY-TO-APPLY. Not applied. A payment sou | function:1 |
| `20261102490000_closure_guards` | READY-TO-APPLY. Not applied. One pending c | function:2,index:1 |
| `20261102500000_release_version_once` | READY-TO-APPLY. Not applied. A release ver | function:1,index:1 |
| `20261102510000_promotion_one_pending` | READY-TO-APPLY. Not applied. One pending p | function:1,index:1 |
| `20261102520000_break_glass_one_open` | READY-TO-APPLY. Not applied. One open brea | function:2,index:1 |
| `20261102530000_job_one_queued` | READY-TO-APPLY. Not applied. One queued ro | function:1,index:1 |
| `20261102540000_alert_name_once` | READY-TO-APPLY. Not applied. An alert name | function:1,index:1 |
| `20261102550000_usage_draft_one` | READY-TO-APPLY. Not applied. One usage dra | function:1,index:1 |
| `20261102560000_partner_name_once` | READY-TO-APPLY. Not applied. A partner nam | function:1,index:1 |
| `20261102570000_sandbox_name_once` | READY-TO-APPLY. Not applied. A sandbox nam | function:1,index:1 |
| `20261102580000_service_case_close` | READY-TO-APPLY. Not applied. One open case | function:2,index:1 |
| `20261102590000_company_references` | READY-TO-APPLY. Not applied. Stored platfo | — |
| `20261102600000_reconciliation_difference` | READY-TO-APPLY. Not applied. A mismatch ca | function:1 |
| `20261102610000_promotion_not_archived` | READY-TO-APPLY. Not applied. Approval stil | function:1 |
| `20261103000000_supervised_support_workflow` | UNAPPLIED HOSTED. Requires reviewed backup | function:12,index:1,trigger:1 |
| `20261103000100_mfa_policies_superadmin_tables` | Extend the aal2 restrictive policy (202610 | — |
| `20261103000200_revoke_anon_definer_execute` | 20261102180000_definer_anon_execute revoke | — |
| `20261103051315_platform_search_navigation` | Operational metadata navigation. Reuses ex | function:4 |
| `20261103055903_platform_operational_workflows` | Operational workflows reuse existing store | function:21,index:2,table:1,trigger:4 |
| `20261103060832_platform_workers_and_observed_alerts` | A bounded, database-local worker. No arbit | function:10,index:3,table:4 |
| `20261103061120_platform_worker_dead_letter_guard` | A dead-lettered scheduled handler pauses t | function:2 |
| `20261103061306_platform_worker_minute_alignment` | Align recurrence to the minute so subsecon | function:1 |
| `20261103153938_cash_allocation_history` | Durable source history. No posted journals | function:1,index:1,policy:1,table:1,trigger:2 |
| `20261103154433_cash_delivery_snapshots` | Freeze source facts at enqueue time; worke | function:4 |
| `20261103154859_accounting_workflow_depth` | Independent LinkBooks workflow implementat | function:20,index:13,policy:3,table:3,trigger:3 |
| `20261104051004_firm_client_profiles` | Firm-owned client portfolio metadata. Does | index:1,policy:3,table:1 |
| `20261104052956_firm_practice_services` | Firm-owned operational work. Never posts t | function:1,index:2,policy:9,table:2,trigger:2 |
| `20261104053216_firm_practice_performance` | Performance follow-up to the Firm & Client | index:3 |
| `20261104053626_accountant_balance_sheet_workpapers` | Account-level balance-sheet workpapers. Op | function:1,index:1,policy:1,table:1 |
| `20261104054143_documents_review_workflow` | Additive review workflow for uploaded comp | function:3,index:3,policy:3,table:2,trigger:3 |
| `20261104070041_firm_practice_completion` | Firm & Clients: reuse existing action_docu | function:3,index:4,policy:12,table:3,trigger:1 |
| `20261104070207_firm_practice_fk_indexes` | FK coverage for cascading company/firm ope | index:8 |
| `20261104072943_accountant_journal_exception_reviews` | Accountant journal exception dispositions: | function:1,index:2,policy:2,table:2 |
| `20261104080233_firm_staff_invitations` | Practice invitations hold only a SHA-256 d | function:6,index:4,table:1 |
| `20261104080239_firm_recurring_invoice_links` | Link a practice engagement to the existing | index:2,policy:4,table:1 |
| `20261104080519_workpaper_reconciling_items` | Workpaper reconciling-issue schedules. No  | function:2,index:2,policy:2,table:2,trigger:1 |
| `20261104081033_cash_source_links_and_report_snapshots` | Cash reporting metadata only: no journal,  | function:8,index:1,sequence:1,trigger:3 |
| `20261104095308_contacts_delivery_address_line2` | Add the optional delivery address line 2 u | — |
| `20261104113112_contact_interactions_timeline` | Contact CRM activity. No accounting postin | function:1,index:3,policy:3,table:1,trigger:1 |
| `20261104113550_contact_interaction_task_default_guard` | A newly created task must start open even  | function:1 |
| `20261104113645_contact_interactions_grant_hardening` | Remove default authenticated table privile | — |
| `20261104115821_settings_currencies_atomic` | Atomic, tenant-scoped replacement of enabl | function:1 |
| `20261104120000_contact_followup_ownership_reminders` | Contact follow-up ownership and in-app rem | function:1,index:2,policy:1 |
| `20261104150000_firm_client_requests` | Firm practice requests: internal tracking  | function:1,index:4,policy:4,table:1,trigger:1 |
| `20261104155000_contact_followup_action_center` | Contact follow-up reminders in the existin | function:4 |
| `20261104165209_legacy_settings_cas` | Transactional compare-and-save for legacy  | function:3 |
| `20261104181716_multicurrency_feature_disable_guard` | Keep multicurrency feature disabling consi | function:2,trigger:2 |
| `20261105041953_settings_lock_policy_cas` | Atomic optimistic-concurrency guard for Ac | function:2,trigger:1 |
| `20261105043716_correction_maker_checker_approvals` | Transaction correction maker/checker appro | function:6,index:2,policy:3,table:3,trigger:2 |
| `20261105065500_contacts_atomic_number_allocation` | Allocate Contact account numbers inside th | function:1,trigger:1 |
| `20261105070334_verified_cash_classification` | Verified reporting metadata only. Accrual  | function:15,index:6,table:5 |
| `20261105083928_cash_inventory_acquisition_evidence` | Reporting evidence only; no postings or jo | function:3,index:1 |
| `20261105153211_journal_source_type_payroll` | Basic Global Payroll Batch 1: journal sour | — |
| `20261105153212_basic_global_payroll_foundation` | Basic Global Payroll Batch 1: foundation s | function:8,index:5,policy:3,table:3 |
| `20261105160709_basic_global_payroll_employees` | Basic Global Payroll Batch 2: employees, p | function:9,index:5,policy:6,table:6 |
| `20261105161752_billing_reference_data` | Billing platform, phase 1: private billing | function:1,index:1,schema:1,table:2 |
| `20261105161753_billing_audit_chain` | Billing platform, phase 1: tamper-evident  | function:4,index:2,schema:1,trigger:1 |
| `20261105161754_billing_accounts` | Billing platform, phase 1: billing account | function:13,index:3,table:2,trigger:5 |
| `20261105164327_billing_plans_catalogue` | Billing platform, phase 2: STANDARD / PRO  | function:13,index:2,table:2,trigger:2 |
| `20261105173000_basic_global_payroll_runs` | Basic Global Payroll Batch 4: pay runs, ap | function:15,index:6,policy:4,table:4 |
| `20261105173804_billing_pricing_engine` | Billing platform, phase 3: country pricing | function:14,index:5,table:3,trigger:2 |
| `20261105175644_billing_legal_documents` | Billing platform, phase 4a: versioned lega | function:11,index:3,table:2,trigger:2 |
| `20261105175645_billing_subscription_lifecycle` | Billing platform, phase 4b: subscription l | function:14,index:3,table:2,trigger:3 |
| `20261105180000_basic_global_payroll_payments` | Basic Global Payroll Batch 5: accrual post | function:15,index:5,policy:2,table:2 |
| `20261105181000_basic_global_payroll_run_hours_adjust` | Allow period hours / unit quantity adjustm | function:1 |
| `20261105182042_billing_payment_pipeline` | Billing platform, phase 5: payment provide | function:26,index:4,table:2 |
| `20261105184413_billing_invoicing_and_tax` | Billing platform, phase 6: seller entities | function:40,index:5,table:9,trigger:7 |
| `20261105223023_billing_coupons` | Billing platform, phase 7: coupons on the  | function:12,index:1,table:2 |
| `20261105224027_billing_partners` | Phase 8: CA partners, referrals and commis | function:28,index:10,table:9,trigger:4 |
| `20261105230114_billing_api_v1` | Phase 9: REST /api/v1 support. Scoped plat | function:10,index:2,table:1 |
| `20261105231127_billing_analytics` | Phase 10: billing analytics for platform s | function:3 |
| `20261106063045_firm_directory_preferences` | User-private firm directory preferences; n | function:1,policy:4,table:1,trigger:1 |
| `20261106064353_firm_bulk_client_profiles` | LinkBooks firm bulk client profile operati | function:3,index:1,policy:2,table:1,trigger:2 |
| `20261106064610_action_center_server_side_triage_20261106` | Smart Action Center: server-side history,  | function:1,index:2,view:1 |
| `20261106064727_ai_conversation_history` | AI Assistant conversation entries: strictl | index:1,policy:4,table:1 |
| `20261106064829_ai_history_explicit_grants` | Tighten direct-table grants on the new con | — |
| `20261106070219_firm_client_bulk_tags` | Extension to practice bulk profile updates | function:2 |
| `20261106070737_firm_services_and_custom_onboarding` | Firm-owned service categories and reusable | function:2,index:3,policy:8,table:2,trigger:2 |
| `20261106070924_product_categories_price_lists` | Non-inventory catalogue taxonomy and draft | index:7,policy:10,table:3 |
| `20261106071215_product_masterdata_privilege_hardening` | Restrict new catalogue tables to exact app | — |
| `20261106071930_firm_template_idempotent_capacity` | Idempotent onboarding template application | function:1 |
| `20261106073444_firm_onboarding_due_assignments_dependencies` | Firm onboarding automation: assignments, d | function:3,index:2,trigger:1 |
| `20261106073653_payroll_payment_currency_guards` | Defensive payroll settlement invariants fo | function:2,trigger:2 |
| `20261106074744_product_customer_price_list_defaults` | Optional one-to-one customer price-list de | index:1,policy:4,table:1 |
| `20261106074931_action_center_search_trigram_index` | Action Center full-history free-text searc | extension:1,index:1 |
| `20261106075054_ai_journal_review_queue` | AI journal review queue. Review sign-off i | function:1,index:3,policy:4,table:2 |
| `20261106080134_firm_onboarding_staff_capacity` | Firm onboarding workload capacity. Advisor | function:1,index:1,policy:4,table:1,trigger:1 |
| `20261106080701_product_price_list_quantity_date_rules` | Advanced non-inventory sales price rules:  | index:1,policy:4,table:1 |
| `20261106081734_payroll_clearing_account_currency_guard` | Guard against payroll payment journals tha | function:1,trigger:1 |
| `20261106081900_firm_onboarding_manager_escalations` | Opt-in manager escalation policies. Existi | function:2,index:1,policy:6,table:2,trigger:1 |
| `20261106082258_ai_workpaper_evidence_pagination` | Phase 8: complete, paginated, account-spec | function:1,index:1 |
| `20261106082609_product_price_list_discount_rules` | Batch 8: independent percentage markdown r | index:1,policy:4,table:1 |
| `20261106083412_firm_onboarding_daily_snapshot_reporting` | Immutable daily onboarding progress observ | function:1,index:1,policy:2,table:1 |
| `20261106084717_sales_draft_pricing_provenance` | Batch 9: atomic pricing provenance for use | function:2,trigger:2 |
| `20261106084934_payroll_payment_idempotency_payload_guard` | Preserve original Payroll payment behavior | function:1 |
| `20261106090917_sales_quote_conversion_pricing_provenance` | Products & Services Batch 10: retain verif | function:1 |
| `20261106091200_quote_conversion_pricing_source_lock` | Guard against a quote changing between sou | function:1 |
| `20261106115500_duplicate_budget` | Copy a budget atomically to a new financia | function:1 |
| `20261106120000_advisors_services_catalogue` | AD-01: LinkBooks Advisors public services  | function:1,index:2,policy:2,table:2 |
| `20261106130000_advisors_catalogue_admin` | AD-02: Advisors catalogue admin — draft/pu | function:9,index:4,table:2,trigger:1 |
| `20261106140000_advisors_chat_leads` | AD-03: Advisors public chat conversations  | function:5,index:3,table:4 |
| `20261106150000_advisors_appointments` | AD-04: Native Advisors appointment booking | extension:1,function:10,index:4,table:5 |
| `20261106160000_advisors_management_console` | AD-05: Advisors inquiry, client and staff  | function:14,index:6,table:1 |
| `20261106170000_advisors_engagements_onboarding` | AD-06: Advisors engagements, proposals, ag | function:20,index:5,table:4 |
| `20261106173000_budget_governance_revisions` | Budget governance and immutable revision s | function:4,index:2,policy:2,table:2,trigger:2 |
| `20261106180000_advisors_billing_bridge` | AD-07: Advisors billing bridge onto existi | function:9,index:3,table:2 |
| `20261106182000_budget_atomic_document_save` | Save a complete existing budget (header +  | function:1 |
| `20261106190000_advisors_workspaces_delivery` | AD-08: Advisors delivery workspaces, perio | function:16,index:5,table:5 |
| `20261106193000_budget_approval_workflows` | Budget approvals: independent reviewer, au | function:2,index:2,policy:2,table:2,trigger:2 |
| `20261106200000_advisors_customer_portal` | AD-09: Advisors customer portal, portal no | function:24,index:8,table:5 |
| `20261106204000_budget_dimension_allocations` | LinkBooks Budgets Batch 7: allocations by  | function:3,index:3,policy:2,table:2,trigger:1 |
| `20261106210000_advisors_security_hardening` | AD-10: Advisors security/reliability harde | function:8 |
| `20261106211000_advisors_revoke_anon_privileged` | AD-10 follow-up: privileged Advisors RPCs  | — |
| `20261106214000_budget_forecast_scenarios` | LinkBooks Budgets Batch 9: saved what-if a | function:2,index:3,policy:2,table:2 |
| `20261106224500_budget_release_grants_hardening` | LinkBooks Budgets release hardening: exist | — |
| `20261106233000_reconciliation_review_cases` | LinkBooks Accounting reconciliation case t | function:1,index:3,policy:2,table:2 |
| `20261106234500_reconciliation_review_signoff` | Accounting reconciliation independent revi | function:2,trigger:1 |
| `20261107010000_tax_master_posted_history_guard` | Preserve tax masters used by posted sales  | function:8,index:2,trigger:11 |
| `20261107011000_tax_gl_review_sessions` | Tax GL exception reviews: versioned workfl | function:1,index:2,policy:2,table:2 |
| `20261107120000_expense_management_foundation` | Expense Management EM-01: foundation schem | function:3,index:11,policy:5,table:5 |
| `20261107123000_expense_management_claim_lifecycle` | Expense Management EM-03: claim draft life | function:9 |
| `20261107130000_expense_management_templates_duplicate` | Expense Management EM-03b: claim templates | function:5,index:2,policy:1,table:1 |
| `20261107133000_expense_management_receipts` | Expense Management EM-04a: claim attachmen | function:5,index:1,policy:1,table:1 |
| `20261107134000_expense_management_receipt_match` | Expense Management EM-04b: receipt inbox f | function:6 |
| `20261107135000_expense_management_approvals` | Expense Management EM-05a: claim approval  | function:5 |
| `20261107136000_expense_management_spending_requests` | Expense Management EM-05b: pre-spend spend | function:11,index:2,policy:1,table:1 |
| `20261107137000_expense_management_posting` | Expense Management EM-06a: post approved e | function:2 |
| `20261107138000_expense_management_reimbursement` | Expense Management EM-07a: reimburse poste | function:4 |
| `20261107139000_expense_management_mileage` | EM-08a: mileage rates + mileage fields on  | function:4,index:1,policy:1,table:1 |
| `20261107140000_expense_management_cash_advances` | EM-08b: cash advances — issue from bank ag | function:9,index:4,policy:1,table:1 |
| `20261107141000_expense_management_petty_cash` | EM-08c: petty cash floats — fund/replenish | function:9,index:3,policy:1,table:1 |
| `20261107142000_expense_management_travel_per_diem` | EM-08d: per diem rates + per-diem travel l | function:4,index:1,policy:1,table:1 |
| `20261107143000_expense_management_corporate_cards` | EM-09a: corporate card register, statement | function:10,index:4,policy:2,table:2 |
| `20261107144000_expense_management_disputes_rebilling` | EM-09b: corporate card disputes + customer | function:6 |
| `20261107145000_expense_management_exit_settlement` | EM-09c: employee exit settlement — outstan | function:6,index:3,policy:1,table:1 |
| `20261107146000_expense_management_risk_duplicates` | EM-10a: duplicate detection, risk indicato | function:6 |
| `20261107147000_expense_management_reports` | EM-11a: expense management report summary  | function:3 |
| `20261107148000_expense_management_notifications_migration` | EM-11b: Action Center expense notification | function:5,index:1 |
| `20261107149000_expense_management_batch_reimburse` | EM-07b: batch reimbursement — pays selecte | function:1 |
| `20261107150000_expense_management_approval_delegation` | EM-05c: approval delegation — temporary st | function:9,index:2,policy:1,table:1 |
| `20261107151000_expense_management_approval_escalation` | EM-05d: escalate stale submitted/in_review | function:3 |
| `20261107152000_expense_management_partial_payroll_reimburse` | EM-07c: partial reimbursements + payroll q | function:4,index:1,policy:1,table:1 |
| `20261107153000_expense_management_multilevel_approvals` | EM-05e: multi-level approvals — N distinct | function:3,index:1,policy:1,table:1 |
| `20261107154000_expense_management_fx_refund` | EM-06b: FX line validation helper + reimbu | function:2 |
| `20261107155000_expense_management_bank_match_suggest` | EM-07d: suggest uncategorised bank transac | function:1 |
| `20261107156000_expense_management_budget_exposure` | EM-06c: soft budget exposure for open expe | function:1 |
| `20261107157000_marketplace_catalogue_foundation` | AS-01: LinkBooks App Store catalogue, inst | function:4,index:5,policy:5,table:8 |
| `20261107158000_marketplace_connections_foundation` | AS-02: Integration connections foundation  | function:2,index:3,policy:2,table:2 |
| `20261107159000_marketplace_xero_parity_addendum` | AS-XP: Xero-parity addendum foundations (c | function:4,index:6,policy:4,table:9 |
| `20261107160000_marketplace_integration_engine` | AS-03 foundation: durable sync jobs, webho | function:1,index:3,policy:5,table:6 |
| `20261107161000_marketplace_security_controls` | AS-SEC: Zero-trust marketplace security co | function:7,index:3,policy:2,table:3 |
| `20261107162000_marketplace_oauth_approval_consent` | AS-SEC-02: OAuth PKCE state, security appr | function:4,index:2,policy:1,table:2 |
| `20261107163000_marketplace_oauth_suspend_catalogue_hardening` | AS-SEC-03: OAuth PKCE state RPCs, platform | function:4 |
| `20261107170051_demo_all_modules` | Demo Company: sample data for every module | function:31,index:1 |
| `20261109120000_crm_foundation` | CRM-02 foundation: settings, sources, pipe | function:13,index:21,policy:9,table:9 |
| `20261109130000_crm_gap_closure` | CRM gap-closure batch: duplicate detection | function:8 |
| `20261109140000_crm_get_settings_volatile` | CRM hotfix: get_crm_settings must be VOLAT | function:1 |
| `20261109150000_crm_opportunity_quote_fk` | CRM-08: enforce opportunity.quote_id refer | index:1 |
| `20261109160000_crm_pipeline_admin` | CRM-05: admin RPCs to create/update pipeli | function:2 |
| `20261109170000_crm_campaigns` | CRM-11: campaign records (attribution cata | function:1,index:2,policy:1,table:1 |
| `20261109180000_crm_territories` | CRM-12: territory catalogue with optional  | function:1,index:2,policy:1,table:1 |
| `20261109190000_hr_management_foundation` | HR-01 foundation: permissions, settings, o | function:12,index:13,policy:30,table:8 |
| `20261109191000_hr_recruitment_onboarding` | HR-04: Recruitment + Onboarding (additive, | function:15,index:12,table:8 |
| `20261109192000_hr_attendance_shifts` | HR-05: Attendance + Shifts & Rosters (addi | function:10,index:7,table:4 |
| `20261109193000_hr_leave_holidays` | HR-06: Leave Management + Holidays & Calen | function:13,index:8,table:5 |
| `20261109194000_hr_ess_manager_approvals` | HR-07: ESS + Manager Workspace + Approvals | function:11 |
| `20261109195000_hr_demo_enable` | HR access follow-up: ensure demo companies | — |
| `20261109200000_hr_documents_assets_cases` | HR-08: Employee documents, assets, employe | function:10,index:7,table:4 |
| `20261109210000_hr_talent_performance_training_comp` | HR-09: Performance, training, compensation | function:9,index:6,table:6 |
| `20261109220000_hr_transfers_offboarding` | HR-10: Transfers / promotions / offboardin | function:8,index:5,table:3 |
| `20261109230000_hr_integrations_action_files_payroll` | HR-11: Action Center alerts, Files attachm | function:9 |
| `20261109240000_hr_reports_automations_import` | HR-12: Reports, automation rules, employee | function:9,index:3,table:2 |
| `20261109250000_hr_security_hardening` | HR-13: Security hardening — reassert RLS + | — |
| `20261109251000_hr_report_aggregate_fix` | HR-12 follow-up: fix nested aggregate in r | function:1 |
| `20261109260000_hr_demo_workforce_seed` | HR demo workforce seed (is_demo companies  | function:2 |
| `20261117104621_bank_coding_memory_events` | Coding Memory: authoritative posted-event  | function:8,index:5,policy:5,table:3,trigger:3 |
| `20261117112004_payroll_catalogue_entitlements` | Match the existing live TypeScript catalog | — |
| `20261117120000_messaging_collaboration_foundation` | LinkBooks unified messaging foundation (Ph | function:14,index:8,policy:18,table:17 |
| `20261117121000_messaging_portal_bridge_and_lifecycle` | Portal bridge + membership lifecycle for u | function:2,trigger:1 |
| `20261117130000_messaging_attachments_portal_actions` | Messaging attachments storage policies, ed | function:11,policy:3 |
| `20261117140000_messaging_advisor_engagement` | Advisor engagement conversations + pin/sta | function:3 |
| `20261117150000_messaging_prefs_unread_mentions` | Notification preferences upsert, mark unre | function:3 |
| `20261117155931_unambiguous_app_audit_rpc` | Retain the UUID SQL signature while enforc | function:2 |
| `20261117160000_messaging_collaboration_flags` | Organisation collaboration flags for messa | function:1 |
| `20261117160451_pin_helper_function_search_paths` | Pin reviewed pure helpers without changing | — |
| `20261117170000_messaging_members_digest_claims` | Add internal members to group conversation | function:1 |
| `20261117180000_messaging_block_retention_rate` | Block/unblock peers, retention days, and s | function:4 |
| `20261117183000_po_goods_receipt` | Purchase-order goods receipt foundation (n | function:4 |
| `20261117190000_messaging_report_message` | Member message reporting into moderation e | function:1 |
| `20261117191000_po_partial_bill_from_received` | Partial bill-from-received for purchase or | function:4 |
| `20261117193000_purchase_bill_void_date` | Record void_date on purchase bills for his | — |
| `20261117194500_purchase_credit_void_date` | Record void_date on supplier credit notes  | — |
| `20261117200000_messaging_rename_remove_member` | Rename group conversations and remove inte | function:2 |
| `20261117205000_supplier_payment_void_date` | Persist void_date on supplier payments for | function:1 |
| `20261117210000_messaging_create_channel` | Internal announcement-style channels (grou | function:1 |
| `20261117220000_messaging_realtime_and_external_lock` | Production hardening: realtime outbox publ | — |
| `20261117220001_pos_register_session_foundation` | POS phase 1: reuse HR physical locations;  | function:12,index:7,policy:3,table:3 |
| `20261117220002_payroll_catalogue_entitlements` | Register the payroll module already declar | — |
| `20261118013918_po_lifecycle_controls` | Original LinkBooks purchasing controls. Op | function:13,index:3,policy:4,table:3,trigger:2 |
| `20261118013950_po_requisitions` | Original LinkBooks purchase requisitions.  | function:7,index:1,policy:1,table:1,trigger:1 |
| `20261118013953_po_billing_integrity` | Original LinkBooks PO billing allocation a | function:19,index:2,trigger:5 |
| `20261118065451_scoped_coding_memory_reset` | Scoped controls forget earlier learning wi | function:8,index:3,policy:2,table:2 |
| `20261118071316_lock_coding_memory_control_scope` | Keep the bank/currency derived by each che | function:2 |
| `20261118140000_pos_cash_sale_expected_cash` | POS cash sale batch: expected session cash | function:13,index:3,policy:5,table:5 |
| `20261118150000_pm_foundation` | PM-01 foundation: settings, properties, un | function:23,index:10,policy:6,table:6 |
| `20261118150351_files_email_inbox` | Files Batch 5: opt-in, company-scoped inbo | function:1,index:2,policy:3,table:1,trigger:1 |
| `20261118150352_files_document_classification_tags` | Files Batch 7: classification and reusable | function:2,index:4,policy:6,table:2,trigger:2 |
| `20261118150353_document_attachment_versions` | Files Batch 8: immutable document versions | function:2,index:1,policy:1,table:1,trigger:1 |
| `20261118150355_files_recycle_retention_cleanup` | Files Batch 9: company-scoped, recoverable | function:6,index:3,policy:10,table:2,trigger:4 |
| `20261118151016_merged_workflow_mfa_guards` | Carry the established MFA requirement onto | function:7 |
| `20261118160000_pm_operations_statements` | PM-02 operations & owner statements: tenan | function:32,index:19,policy:12,table:12 |
| `20261118170000_pm_posting_payouts_portals` | PM-05/09/10 posting, payouts, reserves, po | function:23,index:8,policy:3,table:3 |
| `20261118180000_pm_fix_settings_volatility` | Hotfix: get_pm_* helpers call private.pm_e | function:3 |
| `20261119031445_merged_pos_cash_mfa_guards` | Cash-sale reads require the same opted-in  | — |
| `20261125103000_billing_launch_country_prices` | Launch billing: enable checkout countries  | — |
| `20261125164222_advisors_razorpay_public_checkout` | Public Advisors purchases use Razorpay dir | function:6,index:3,table:1 |

Hosted-only SQL source not available in the repo: `20261124112655_streakbooks_report_worker_dispatch_url`; Supabase reports that version applied. The migration list API provides its version/name but not its SQL body. Recover its immutable source before migration-history repair or new hosted migration work.

## Supabase table inventory

Table flags are point-in-time. “RLS enabled” is separate from policy coverage and FORCE RLS.

| Table | RLS | Forced |
|---|---|---|
| `auth.audit_log_entries` | enabled | no |
| `auth.custom_oauth_providers` | disabled | no |
| `auth.flow_state` | enabled | no |
| `auth.identities` | enabled | no |
| `auth.instances` | enabled | no |
| `auth.mfa_amr_claims` | enabled | no |
| `auth.mfa_challenges` | enabled | no |
| `auth.mfa_factors` | enabled | no |
| `auth.mfa_recovery_code_sets` | disabled | no |
| `auth.mfa_recovery_codes` | disabled | no |
| `auth.oauth_authorizations` | disabled | no |
| `auth.oauth_client_states` | disabled | no |
| `auth.oauth_clients` | disabled | no |
| `auth.oauth_consents` | disabled | no |
| `auth.one_time_tokens` | enabled | no |
| `auth.refresh_tokens` | enabled | no |
| `auth.saml_providers` | enabled | no |
| `auth.saml_relay_states` | enabled | no |
| `auth.schema_migrations` | enabled | no |
| `auth.scim_tokens` | disabled | no |
| `auth.scim_users` | disabled | no |
| `auth.sessions` | enabled | no |
| `auth.sso_domains` | enabled | no |
| `auth.sso_providers` | enabled | no |
| `auth.users` | enabled | no |
| `auth.webauthn_challenges` | disabled | no |
| `auth.webauthn_credentials` | disabled | no |
| `billing.api_idempotency` | enabled | no |
| `billing.billing_account_companies` | enabled | no |
| `billing.billing_accounts` | enabled | no |
| `billing.cancellation_requests` | enabled | no |
| `billing.commission_ledger` | enabled | no |
| `billing.commission_rules` | enabled | no |
| `billing.countries` | enabled | no |
| `billing.country_pricing_rules` | enabled | no |
| `billing.coupon_redemptions` | enabled | no |
| `billing.credit_notes` | enabled | no |
| `billing.currencies` | enabled | no |
| `billing.exchange_rates` | enabled | no |
| `billing.invoice_lines` | enabled | no |
| `billing.invoice_series` | enabled | no |
| `billing.invoices` | enabled | no |
| `billing.legal_acceptances` | enabled | no |
| `billing.legal_documents` | enabled | no |
| `billing.partner_payouts` | enabled | no |
| `billing.partner_program` | enabled | no |
| `billing.partner_program_changes` | enabled | no |
| `billing.partner_users` | enabled | no |
| `billing.payment_provider_routes` | enabled | no |
| `billing.payments` | enabled | no |
| `billing.price_inputs` | enabled | no |
| `billing.provider_coupon_mappings` | enabled | no |
| `billing.provider_price_mappings` | enabled | no |
| `billing.provider_tax_rate_mappings` | enabled | no |
| `billing.referral_attributions` | enabled | no |
| `billing.referral_codes` | enabled | no |
| `billing.referral_touches` | enabled | no |
| `billing.refunds` | enabled | no |
| `billing.seller_entities` | enabled | no |
| `billing.subscription_events` | enabled | no |
| `billing.tax_rules` | enabled | no |
| `billing.trial_eligibility_rules` | enabled | no |
| `billing.trial_grants` | enabled | no |
| `cron.job` | enabled | no |
| `cron.job_run_details` | enabled | no |
| `net._http_response` | disabled | no |
| `net.http_request_queue` | disabled | no |
| `private.firm_access_grants` | enabled | no |
| `private.firm_staff_invitations` | enabled | no |
| `private.platform_job_schedules` | enabled | no |
| `private.platform_operation_receipts` | enabled | no |
| `private.platform_request_buckets` | enabled | no |
| `private.platform_worker_state` | enabled | no |
| `private.po_reset_context` | disabled | no |
| `private.reporting_worker_state` | disabled | no |
| `public.account_workpaper_reconciling_item_events` | enabled | no |
| `public.account_workpaper_reconciling_items` | enabled | no |
| `public.account_workpapers` | enabled | no |
| `public.accountant_journal_exception_events` | enabled | no |
| `public.accountant_journal_exception_reviews` | enabled | no |
| `public.accounting_periods` | enabled | no |
| `public.accounts` | enabled | no |
| `public.action_document_requests` | enabled | no |
| `public.action_notification_preferences` | enabled | no |
| `public.action_notification_refresh_state` | enabled | no |
| `public.action_notifications` | enabled | no |
| `public.advisors_agreements` | enabled | no |
| `public.advisors_appointment_reminders` | enabled | no |
| `public.advisors_appointments` | enabled | no |
| `public.advisors_availability_exceptions` | enabled | no |
| `public.advisors_billing_sku_map` | enabled | no |
| `public.advisors_booking_settings` | enabled | no |
| `public.advisors_catalogue_audit` | enabled | no |
| `public.advisors_catalogue_versions` | enabled | no |
| `public.advisors_chat_rate_limits` | enabled | no |
| `public.advisors_clients` | enabled | no |
| `public.advisors_conversations` | enabled | no |
| `public.advisors_delivery_tasks` | enabled | no |
| `public.advisors_document_requests` | enabled | no |
| `public.advisors_engagements` | enabled | no |
| `public.advisors_leads` | enabled | no |
| `public.advisors_messages` | enabled | no |
| `public.advisors_onboarding_tasks` | enabled | no |
| `public.advisors_portal_invites` | enabled | no |
| `public.advisors_portal_messages` | enabled | no |
| `public.advisors_portal_notifications` | enabled | no |
| `public.advisors_portal_service_requests` | enabled | no |
| `public.advisors_proposals` | enabled | no |
| `public.advisors_public_purchases` | enabled | no |
| `public.advisors_service_plans` | enabled | no |
| `public.advisors_services` | enabled | no |
| `public.advisors_staff` | enabled | no |
| `public.advisors_subscriptions` | enabled | no |
| `public.advisors_work_periods` | enabled | no |
| `public.advisors_working_hours` | enabled | no |
| `public.advisors_workspace_notes` | enabled | no |
| `public.advisors_workspaces` | enabled | no |
| `public.ai_conversation_entries` | enabled | no |
| `public.ai_journal_review_cases` | enabled | no |
| `public.ai_journal_review_events` | enabled | no |
| `public.ai_suggestions` | enabled | no |
| `public.ai_usage_events` | enabled | no |
| `public.app_categories` | enabled | no |
| `public.app_certification_reviews` | enabled | no |
| `public.app_connection_consents` | enabled | no |
| `public.app_install_requests` | enabled | no |
| `public.app_installations` | enabled | no |
| `public.approval_requests` | enabled | no |
| `public.asset_depreciation_entries` | enabled | no |
| `public.asset_depreciation_runs` | enabled | no |
| `public.asset_types` | enabled | no |
| `public.audit_events` | enabled | no |
| `public.bank_account_details` | enabled | no |
| `public.bank_accounts` | enabled | no |
| `public.bank_coding_events` | enabled | no |
| `public.bank_coding_feedback` | enabled | no |
| `public.bank_coding_history` | enabled | no |
| `public.bank_coding_memory_controls` | enabled | no |
| `public.bank_coding_memory_preferences` | enabled | no |
| `public.bank_coding_memory_resets` | enabled | no |
| `public.bank_feed_connections` | enabled | no |
| `public.bank_import_mappings` | enabled | no |
| `public.bank_rules` | enabled | no |
| `public.bank_statement_imports` | enabled | no |
| `public.bank_transactions` | enabled | no |
| `public.bank_transfers` | enabled | no |
| `public.bill_internal_notes` | enabled | no |
| `public.billing_addons` | enabled | no |
| `public.billing_checkouts` | enabled | no |
| `public.billing_cost_inputs` | enabled | no |
| `public.billing_events` | enabled | no |
| `public.billing_features` | enabled | no |
| `public.billing_lifetime_payments` | enabled | no |
| `public.billing_offers` | enabled | no |
| `public.billing_operators` | enabled | no |
| `public.billing_plans` | enabled | no |
| `public.billing_prorations` | enabled | no |
| `public.billing_provider_fees` | enabled | no |
| `public.billing_provider_reconciliations` | enabled | no |
| `public.billing_settings` | enabled | no |
| `public.billing_usage_drafts` | enabled | no |
| `public.break_glass_events` | enabled | no |
| `public.break_glass_grants` | enabled | no |
| `public.budget_approval_events` | enabled | no |
| `public.budget_approval_state` | enabled | no |
| `public.budget_dimension_lines` | enabled | no |
| `public.budget_dimension_revisions` | enabled | no |
| `public.budget_forecast_scenario_events` | enabled | no |
| `public.budget_forecast_scenarios` | enabled | no |
| `public.budget_governance` | enabled | no |
| `public.budget_lines` | enabled | no |
| `public.budget_revisions` | enabled | no |
| `public.budgets` | enabled | no |
| `public.cash_allocation_history` | enabled | no |
| `public.cash_classification_audit` | enabled | no |
| `public.cash_classification_exceptions` | enabled | no |
| `public.cash_classification_policies` | enabled | no |
| `public.cash_inventory_evidence` | enabled | no |
| `public.cash_opening_evidence` | enabled | no |
| `public.coa_apply_events` | enabled | no |
| `public.coa_audit_log` | enabled | no |
| `public.coa_industries` | enabled | no |
| `public.communication_digest_preferences` | enabled | no |
| `public.communication_scheduled_deliveries` | enabled | no |
| `public.communication_send_claims` | enabled | no |
| `public.companies` | enabled | no |
| `public.company_branding` | enabled | no |
| `public.company_closure_requests` | enabled | no |
| `public.company_coa_settings` | enabled | no |
| `public.company_contact_settings` | enabled | no |
| `public.company_currencies` | enabled | no |
| `public.company_invitations` | enabled | no |
| `public.company_members` | enabled | no |
| `public.company_payment_terms` | enabled | no |
| `public.company_reminder_settings` | enabled | no |
| `public.company_subscriptions` | enabled | no |
| `public.company_tax_pack_applications` | enabled | no |
| `public.company_tax_settings` | enabled | no |
| `public.company_workflow_settings` | enabled | no |
| `public.contact_addresses` | enabled | no |
| `public.contact_group_members` | enabled | no |
| `public.contact_groups` | enabled | no |
| `public.contact_interactions` | enabled | no |
| `public.contact_payment_details` | enabled | no |
| `public.contact_people` | enabled | no |
| `public.contact_tag_assignments` | enabled | no |
| `public.contact_tags` | enabled | no |
| `public.contacts` | enabled | no |
| `public.conversion_balance_batches` | enabled | no |
| `public.correction_approval_events` | enabled | no |
| `public.correction_approval_policies` | enabled | no |
| `public.correction_approval_requests` | enabled | no |
| `public.crm_activities` | enabled | no |
| `public.crm_campaigns` | enabled | no |
| `public.crm_lead_events` | enabled | no |
| `public.crm_lead_sources` | enabled | no |
| `public.crm_leads` | enabled | no |
| `public.crm_opportunities` | enabled | no |
| `public.crm_opportunity_stage_history` | enabled | no |
| `public.crm_pipeline_stages` | enabled | no |
| `public.crm_pipelines` | enabled | no |
| `public.crm_settings` | enabled | no |
| `public.crm_territories` | enabled | no |
| `public.currency_decimals` | enabled | no |
| `public.deferral_entries` | enabled | no |
| `public.deferral_schedules` | enabled | no |
| `public.developer_api_usage_daily` | enabled | no |
| `public.developer_applications` | enabled | no |
| `public.developer_oauth_clients` | enabled | no |
| `public.developer_partner_tiers` | enabled | no |
| `public.developer_publishers` | enabled | no |
| `public.developer_usage_alerts` | enabled | no |
| `public.document_attachment_tags` | enabled | no |
| `public.document_attachment_versions` | enabled | no |
| `public.document_attachments` | enabled | no |
| `public.document_email_inboxes` | enabled | no |
| `public.document_folders` | enabled | no |
| `public.document_internal_notes` | enabled | no |
| `public.document_retention_settings` | enabled | no |
| `public.document_review_events` | enabled | no |
| `public.document_reviews` | enabled | no |
| `public.document_sequences` | enabled | no |
| `public.document_share_links` | enabled | no |
| `public.document_storage_cleanup_jobs` | enabled | no |
| `public.document_tags` | enabled | no |
| `public.document_theme_defaults` | enabled | no |
| `public.document_themes` | enabled | no |
| `public.document_tracking_assignments` | enabled | no |
| `public.email_outbox` | enabled | no |
| `public.employee_expense_claims` | enabled | no |
| `public.entitlement_overrides` | enabled | no |
| `public.exchange_rates` | enabled | no |
| `public.expense_approval_delegations` | enabled | no |
| `public.expense_cash_advances` | enabled | no |
| `public.expense_categories` | enabled | no |
| `public.expense_claim_approvals` | enabled | no |
| `public.expense_claim_events` | enabled | no |
| `public.expense_claim_lines` | enabled | no |
| `public.expense_claim_reimbursement_payments` | enabled | no |
| `public.expense_claim_templates` | enabled | no |
| `public.expense_claims` | enabled | no |
| `public.expense_corporate_card_transactions` | enabled | no |
| `public.expense_corporate_cards` | enabled | no |
| `public.expense_exit_settlements` | enabled | no |
| `public.expense_management_settings` | enabled | no |
| `public.expense_mileage_rates` | enabled | no |
| `public.expense_per_diem_rates` | enabled | no |
| `public.expense_petty_cash_floats` | enabled | no |
| `public.expense_receipt_inbox_entries` | enabled | no |
| `public.expense_spending_requests` | enabled | no |
| `public.external_record_links` | enabled | no |
| `public.feature_dependencies` | enabled | no |
| `public.feature_prices` | enabled | no |
| `public.feature_rollouts` | enabled | no |
| `public.firm_app_recommendations` | enabled | no |
| `public.firm_client_assignments` | enabled | no |
| `public.firm_client_links` | enabled | no |
| `public.firm_client_onboarding_steps` | enabled | no |
| `public.firm_client_profile_audit` | enabled | no |
| `public.firm_client_profiles` | enabled | no |
| `public.firm_client_requests` | enabled | no |
| `public.firm_document_request_tracking` | enabled | no |
| `public.firm_engagement_invoice_links` | enabled | no |
| `public.firm_engagement_recurring_links` | enabled | no |
| `public.firm_engagements` | enabled | no |
| `public.firm_members` | enabled | no |
| `public.firm_onboarding_daily_snapshots` | enabled | no |
| `public.firm_onboarding_escalation_events` | enabled | no |
| `public.firm_onboarding_escalation_policies` | enabled | no |
| `public.firm_onboarding_staff_capacity` | enabled | no |
| `public.firm_onboarding_template_steps` | enabled | no |
| `public.firm_service_categories` | enabled | no |
| `public.firm_ui_preferences` | enabled | no |
| `public.firms` | enabled | no |
| `public.fixed_asset_import_refs` | enabled | no |
| `public.fixed_assets` | enabled | no |
| `public.fx_journal_tags` | enabled | no |
| `public.fx_realised_postings` | enabled | no |
| `public.fx_revaluation_runs` | enabled | no |
| `public.hr_applications` | enabled | no |
| `public.hr_asset_assignments` | enabled | no |
| `public.hr_asset_types` | enabled | no |
| `public.hr_attendance_corrections` | enabled | no |
| `public.hr_attendance_logs` | enabled | no |
| `public.hr_audit_events` | enabled | no |
| `public.hr_automation_rules` | enabled | no |
| `public.hr_automation_runs` | enabled | no |
| `public.hr_branches` | enabled | no |
| `public.hr_cases` | enabled | no |
| `public.hr_compensation_changes` | enabled | no |
| `public.hr_departments` | enabled | no |
| `public.hr_designations` | enabled | no |
| `public.hr_employee_documents` | enabled | no |
| `public.hr_employee_profiles` | enabled | no |
| `public.hr_holiday_calendars` | enabled | no |
| `public.hr_holidays` | enabled | no |
| `public.hr_interviews` | enabled | no |
| `public.hr_job_requisitions` | enabled | no |
| `public.hr_leave_balances` | enabled | no |
| `public.hr_leave_requests` | enabled | no |
| `public.hr_leave_types` | enabled | no |
| `public.hr_locations` | enabled | no |
| `public.hr_offboarding_cases` | enabled | no |
| `public.hr_offboarding_tasks` | enabled | no |
| `public.hr_offers` | enabled | no |
| `public.hr_onboarding_cases` | enabled | no |
| `public.hr_onboarding_tasks` | enabled | no |
| `public.hr_onboarding_template_tasks` | enabled | no |
| `public.hr_onboarding_templates` | enabled | no |
| `public.hr_performance_cycles` | enabled | no |
| `public.hr_performance_goals` | enabled | no |
| `public.hr_performance_reviews` | enabled | no |
| `public.hr_position_history` | enabled | no |
| `public.hr_settings` | enabled | no |
| `public.hr_shift_assignments` | enabled | no |
| `public.hr_shift_templates` | enabled | no |
| `public.hr_training_courses` | enabled | no |
| `public.hr_training_enrollments` | enabled | no |
| `public.hr_transfer_requests` | enabled | no |
| `public.inbox_documents` | enabled | no |
| `public.integration_connections` | enabled | no |
| `public.integration_mappings` | enabled | no |
| `public.integration_quality_checks` | enabled | no |
| `public.integration_sync_events` | enabled | no |
| `public.integration_sync_jobs` | enabled | no |
| `public.integration_webhook_deliveries` | enabled | no |
| `public.integration_webhook_subscriptions` | enabled | no |
| `public.issued_document_appearances` | enabled | no |
| `public.journal_auto_reversals` | enabled | no |
| `public.journal_lines` | enabled | no |
| `public.journals` | enabled | no |
| `public.line_tracking_assignments` | enabled | no |
| `public.marketplace_analytics_events` | enabled | no |
| `public.marketplace_app_categories` | enabled | no |
| `public.marketplace_app_versions` | enabled | no |
| `public.marketplace_apps` | enabled | no |
| `public.marketplace_oauth_states` | enabled | no |
| `public.marketplace_rate_events` | enabled | no |
| `public.marketplace_security_alerts` | enabled | no |
| `public.marketplace_security_incidents` | enabled | no |
| `public.marketplace_security_reviews` | enabled | no |
| `public.member_permission_adjustments` | enabled | no |
| `public.messaging_attachments` | enabled | no |
| `public.messaging_audit_events` | enabled | no |
| `public.messaging_conversation_members` | enabled | no |
| `public.messaging_conversations` | enabled | no |
| `public.messaging_invitations` | enabled | no |
| `public.messaging_message_reactions` | enabled | no |
| `public.messaging_message_receipts` | enabled | no |
| `public.messaging_message_versions` | enabled | no |
| `public.messaging_messages` | enabled | no |
| `public.messaging_moderation_events` | enabled | no |
| `public.messaging_notification_preferences` | enabled | no |
| `public.messaging_outbox_events` | enabled | no |
| `public.messaging_record_links` | enabled | no |
| `public.messaging_retention_policies` | enabled | no |
| `public.messaging_settings` | enabled | no |
| `public.messaging_starred_messages` | enabled | no |
| `public.messaging_user_blocks` | enabled | no |
| `public.money_deposit_items` | enabled | no |
| `public.money_document_credit_uses` | enabled | no |
| `public.money_document_lines` | enabled | no |
| `public.money_documents` | enabled | no |
| `public.mrr_movements` | enabled | no |
| `public.organisation_config` | enabled | no |
| `public.organisation_features` | enabled | no |
| `public.organisation_lock_policy` | enabled | no |
| `public.organisation_secrets` | enabled | no |
| `public.payroll_component_types` | enabled | no |
| `public.payroll_employee_payment_details` | enabled | no |
| `public.payroll_employee_salary_lines` | enabled | no |
| `public.payroll_employee_salary_versions` | enabled | no |
| `public.payroll_employees` | enabled | no |
| `public.payroll_pay_schedules` | enabled | no |
| `public.payroll_payment_allocations` | enabled | no |
| `public.payroll_payments` | enabled | no |
| `public.payroll_payslips` | enabled | no |
| `public.payroll_run_employees` | enabled | no |
| `public.payroll_run_lines` | enabled | no |
| `public.payroll_runs` | enabled | no |
| `public.payroll_salary_structure_lines` | enabled | no |
| `public.payroll_salary_structures` | enabled | no |
| `public.payroll_settings` | enabled | no |
| `public.plan_prices` | enabled | no |
| `public.plan_version_limits` | enabled | no |
| `public.plan_versions` | enabled | no |
| `public.platform_alert_events` | enabled | no |
| `public.platform_alert_rules` | enabled | no |
| `public.platform_api_keys` | enabled | no |
| `public.platform_audit` | enabled | no |
| `public.platform_billing_audit` | enabled | no |
| `public.platform_custom_roles` | enabled | no |
| `public.platform_incidents` | enabled | no |
| `public.platform_job_runs` | enabled | no |
| `public.platform_jobs` | enabled | no |
| `public.platform_partners` | enabled | no |
| `public.platform_promotions` | enabled | no |
| `public.platform_records` | enabled | no |
| `public.platform_releases` | enabled | no |
| `public.platform_role_assignments` | enabled | no |
| `public.platform_roles` | enabled | no |
| `public.platform_sandbox_requests` | enabled | no |
| `public.platform_segment_members` | enabled | no |
| `public.platform_segments` | enabled | no |
| `public.platform_service_cases` | enabled | no |
| `public.platform_support_grants` | enabled | no |
| `public.platform_tenant_controls` | enabled | no |
| `public.platform_user_controls` | enabled | no |
| `public.platform_webhook_deliveries` | enabled | no |
| `public.pm_commission_calculations` | enabled | no |
| `public.pm_fee_rules` | enabled | no |
| `public.pm_leases` | enabled | no |
| `public.pm_management_agreements` | enabled | no |
| `public.pm_owner_distributions` | enabled | no |
| `public.pm_owner_reserves` | enabled | no |
| `public.pm_owner_statement_lines` | enabled | no |
| `public.pm_owner_statements` | enabled | no |
| `public.pm_owners` | enabled | no |
| `public.pm_portal_access` | enabled | no |
| `public.pm_properties` | enabled | no |
| `public.pm_property_ownership` | enabled | no |
| `public.pm_rent_charges` | enabled | no |
| `public.pm_rent_schedules` | enabled | no |
| `public.pm_reservation_financial_lines` | enabled | no |
| `public.pm_reservations` | enabled | no |
| `public.pm_security_deposits` | enabled | no |
| `public.pm_settings` | enabled | no |
| `public.pm_statement_snapshots` | enabled | no |
| `public.pm_tenants` | enabled | no |
| `public.pm_units` | enabled | no |
| `public.portal_bank_change_requests` | enabled | no |
| `public.portal_files` | enabled | no |
| `public.portal_memberships` | enabled | no |
| `public.portal_messages` | enabled | no |
| `public.portal_notifications` | enabled | no |
| `public.portal_payment_events` | enabled | no |
| `public.portal_payment_intents` | enabled | no |
| `public.portal_po_acknowledgements` | enabled | no |
| `public.portal_rate_events` | enabled | no |
| `public.portal_reminder_log` | enabled | no |
| `public.portal_settings` | enabled | no |
| `public.portal_staff_alerts` | enabled | no |
| `public.portal_supplier_submissions` | enabled | no |
| `public.pos_cash_movements` | enabled | no |
| `public.pos_location_access` | enabled | no |
| `public.pos_refunds` | enabled | no |
| `public.pos_register_sessions` | enabled | no |
| `public.pos_registers` | enabled | no |
| `public.pos_sale_lines` | enabled | no |
| `public.pos_sale_payments` | enabled | no |
| `public.pos_sales` | enabled | no |
| `public.practice_tasks` | enabled | no |
| `public.price_change_log` | enabled | no |
| `public.product_categories` | enabled | no |
| `public.product_customer_price_list_defaults` | enabled | no |
| `public.product_price_list_discount_rules` | enabled | no |
| `public.product_price_list_items` | enabled | no |
| `public.product_price_list_rules` | enabled | no |
| `public.product_price_lists` | enabled | no |
| `public.products` | enabled | no |
| `public.profiles` | enabled | no |
| `public.projects` | enabled | no |
| `public.public_api_scopes` | enabled | no |
| `public.purchase_bill_lines` | enabled | no |
| `public.purchase_bills` | enabled | no |
| `public.purchase_credit_allocations` | enabled | no |
| `public.purchase_credit_note_lines` | enabled | no |
| `public.purchase_credit_notes` | enabled | no |
| `public.purchase_expenses` | enabled | no |
| `public.purchase_order_events` | enabled | no |
| `public.purchase_order_lines` | enabled | no |
| `public.purchase_order_receipts` | enabled | no |
| `public.purchase_orders` | enabled | no |
| `public.purchase_requisitions` | enabled | no |
| `public.reconciliation_links` | enabled | no |
| `public.reconciliation_review_cases` | enabled | no |
| `public.reconciliation_review_events` | enabled | no |
| `public.reconciliation_session_lines` | enabled | no |
| `public.reconciliation_sessions` | enabled | no |
| `public.recurring_bills` | enabled | no |
| `public.recurring_generation_runs` | enabled | no |
| `public.recurring_journal_occurrences` | enabled | no |
| `public.recurring_journal_templates` | enabled | no |
| `public.recurring_occurrences` | enabled | no |
| `public.recurring_schedule_exceptions` | enabled | no |
| `public.recurring_schedules` | enabled | no |
| `public.recurring_template_versions` | enabled | no |
| `public.recurring_templates` | enabled | no |
| `public.report_comments` | enabled | no |
| `public.report_deliveries` | enabled | no |
| `public.report_grants` | enabled | no |
| `public.report_model_versions` | enabled | no |
| `public.report_models` | enabled | no |
| `public.report_open_events` | enabled | no |
| `public.report_packs` | enabled | no |
| `public.report_saved_views` | enabled | no |
| `public.report_schedules` | enabled | no |
| `public.role_permissions` | enabled | no |
| `public.sales_credit_allocations` | enabled | no |
| `public.sales_credit_note_lines` | enabled | no |
| `public.sales_credit_notes` | enabled | no |
| `public.sales_invoice_lines` | enabled | no |
| `public.sales_invoices` | enabled | no |
| `public.sales_orders` | enabled | no |
| `public.sales_quote_lines` | enabled | no |
| `public.sales_quotes` | enabled | no |
| `public.sales_receipt_allocations` | enabled | no |
| `public.sales_receipts` | enabled | no |
| `public.sales_recurring_invoice_lines` | enabled | no |
| `public.sales_recurring_invoices` | enabled | no |
| `public.settings_change_log` | enabled | no |
| `public.supplier_payment_allocations` | enabled | no |
| `public.supplier_payments` | enabled | no |
| `public.tax_codes` | enabled | no |
| `public.tax_gl_review_events` | enabled | no |
| `public.tax_gl_review_sessions` | enabled | no |
| `public.tax_rates` | enabled | no |
| `public.tax_return_lines` | enabled | no |
| `public.tax_returns` | enabled | no |
| `public.tracking_categories` | enabled | no |
| `public.tracking_options` | enabled | no |
| `public.transaction_correction_batches` | enabled | no |
| `public.transaction_correction_items` | enabled | no |
| `public.usage_counters` | enabled | no |
| `public.user_ui_preferences` | enabled | no |
| `realtime.messages` | enabled | no |
| `realtime.messages_2026_11_23` | disabled | no |
| `realtime.messages_2026_11_24` | disabled | no |
| `realtime.messages_2026_11_25` | disabled | no |
| `realtime.messages_2026_11_26` | disabled | no |
| `realtime.messages_2026_11_27` | disabled | no |
| `realtime.messages_2026_11_28` | disabled | no |
| `realtime.messages_2026_11_29` | disabled | no |
| `realtime.schema_migrations` | disabled | no |
| `realtime.subscription` | disabled | no |
| `storage.bucket_lifecycle_states` | enabled | no |
| `storage.buckets` | enabled | no |
| `storage.buckets_analytics` | enabled | no |
| `storage.buckets_vectors` | enabled | no |
| `storage.lifecycle_abandoned_artifacts` | enabled | no |
| `storage.migrations` | enabled | no |
| `storage.objects` | enabled | no |
| `storage.s3_multipart_uploads` | enabled | no |
| `storage.s3_multipart_uploads_parts` | enabled | no |
| `storage.vector_indexes` | enabled | no |
| `supabase_migrations.schema_migrations` | disabled | no |
| `vault.secrets` | disabled | no |

