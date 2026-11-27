# Billing production readiness validation

**Date:** 2026-11-27  
**Scope:** Migration verification, invoices, webhook-retry, Test Clocks, security, deploy checklist.

## 1. Database migration status

| Migration | Purpose | Applied to live? |
| --------- | ------- | ---------------- |
| `20261127083000_billing_plan_change_v2.sql` | Interval switch, reverse scheduled change, contact email | **No — requires your apply** |
| `20261127090000_billing_production_readiness.sql` | past_due error path, contact-email permission, active member filter | **No — requires your apply** |

Supabase MCP in this environment only lists project `LeadOrbit` (`kqmuxocbmtydkxdvmypy`). StreakBooks project `qugoaaizclvkzesptovm` is **not** linked here — migrations cannot be listed or applied via agent tools.

### Verification findings (v2 + readiness)

| Check | Result |
| ----- | ------ |
| SQL syntax | Valid PostgreSQL; `DROP FUNCTION (uuid,text)` then 3-arg with `DEFAULT NULL` |
| Backward compatibility | Callers with 2 args still work via default `_interval` |
| Existing subscriptions | No `UPDATE` of `company_subscriptions` data; RPCs only |
| RLS | Functions are `SECURITY DEFINER` + `has_company_permission` / service_role |
| Contact email | Authenticated needs `billing.view`; service_role for webhooks |
| Scheduled + webhooks | Clear scheduled sets `scheduled_*=NULL`; Stripe sync guard still blocks early unlock |
| Indexes | No new tables; uses existing PK/indexes |
| past_due | Readiness migration reorders checks so dedicated error is reachable |

### Local / staging apply (do this first)

```bash
cd ~/Projects/streakbooks
# Option A — linked CLI project
supabase db push --dry-run   # review
supabase db push             # apply to linked project

# Option B — SQL editor on staging project
# Paste 20261127083000 then 20261127090000 in order
```

### Production apply (explicit — do not auto-run)

1. Backup / confirm PITR on the StreakBooks Supabase project.
2. Apply **v2** then **readiness** migrations in order (SQL editor or `supabase db push` against prod after staging validation).
3. Smoke: `select public.billing_prepare_plan_change('<company>', 'pro', 'year');` as a billing manager (expect jsonb or known business error, not missing-function).
4. Smoke: `select public.billing_clear_scheduled_plan_change('<company>');`
5. Confirm no app errors on Settings → Subscription.
6. Re-run `npm run test:billing:postgres` against a container that includes these two migrations (Docker was unavailable in this agent session).

---

## 2. Stripe Test Clock tests

| Suite | Command | Result (this session) |
| ----- | ------- | --------------------- |
| Policy contracts | always on | **Passed** |
| Smoke create/delete clock | `STRIPE_TEST_CLOCKS=1` + `STRIPE_SECRET_KEY=sk_test_…` | **Passed** (live test mode) |
| Full journey | `STRIPE_TEST_CLOCKS=full` + test secret | **Passed** (~58s) |

Full journey covered against Stripe test API (ephemeral products/prices; no Supabase sync in this suite):

1. Create monthly subscription  
2–5. Preview proration → upgrade → pay invoice → verify price  
6–7. Monthly → annual → annual → monthly (interval change)  
8–9. Schedule cancel-at-period-end → reverse  
10. Advance clock ~32d (wait until clock `ready`)  
11–12. Attach failing PM → restore Visa  
13. Cancel subscription + list invoices  
15. Separate case: trial expire via clock advance  

**Not asserted here:** item 14 (reactivate after cancel — Stripe API limited; use Billing Portal in UI), and Stripe↔Supabase webhook sync (needs deployed app + webhook endpoint + applied migrations).

Bug fixed during Test Clocks: `stripeChangePrice` no longer sends `billing_cycle_anchor=unchanged` when month↔year changes (Stripe rejects that).

---

## 3. Invoice management

| Source | What shows | Pay / PDF |
| ------ | ---------- | --------- |
| Stripe API (`listProviderInvoices`) | open, paid, void, uncollectible, proration badge | Pay → hosted invoice URL; PDF → Stripe PDF |
| Platform `billing.invoices` | paid / credited tax invoices (immutable) | PDF via existing signed URL |
| Credit notes | Unchanged | PDF |

**By design:** open/failed Stripe invoices are **not** written into `billing.invoices` (status CHECK is paid/credited only; snapshots stay immutable).

---

## 4. Webhook retry cron

| Item | Status |
| ---- | ------ |
| Route | `POST /api/billing/webhook-retry` in `src/server.ts` |
| Auth | `authenticateCronRequest` — Bearer `STREAKBOOKS_CRON_SECRET` (or `LOVABLE_CRON_SECRET`), timing-safe hash compare, optional `_PREVIOUS` |
| Processing | `retryDueWebhooks` → `billing_webhook_due` → `processStoredEvent` (idempotent event store) |
| Dead-letter | Existing `billing_events` failed/dead + platform Payment Operations requeue |
| Deploy config in-repo | `vercel.json` cron every 5 min; route accepts GET+POST |
| Unit coverage | `src/lib/billing/cron-auth.test.ts` **Passed** |

### Deploy / verify (manual)

1. Set `STREAKBOOKS_CRON_SECRET` on the host (Production + Preview). Never commit the value.
2. Schedule every 2–5 minutes:

```http
POST https://<app-host>/api/billing/webhook-retry
Authorization: Bearer <STREAKBOOKS_CRON_SECRET>
```

Examples: Vercel Cron (project UI), Supabase `pg_cron` + `pg_net`, or GitHub Action with secret.

3. Verify: missing secret → **500**; wrong Bearer → **401**; success → `{ "processed": n, "failed": n }`.
4. Force a failed event in Payment Operations → confirm retry clears or dead-letters.

---

## 5. UI E2E scenarios (manual — your login)

| # | Scenario | How to verify |
| - | -------- | ------------- |
| A | New monthly subscribe | Settings → Subscription → Subscribe → Stripe Checkout |
| B | Upgrade | Switch higher plan → preview Due now → Stripe / card on file |
| C | Monthly → annual | Toggle Yearly → Switch same/other plan |
| D | Downgrade scheduled | Confirm → see effective date on summary |
| E | Reverse downgrade | **Keep current plan** |
| F | Payment failed | Stripe test clock / fail renewal → past_due banner |
| G | Recover | Manage billing → update card |
| H | Invoices | Billing documents: Stripe outstanding + history + PDF |
| I | Same company entitlements | Second user with role; posting uses company subscription |
| J | Tenant isolation | Other company Settings must not show this company’s invoices |

---

## 6. Security review (code-level)

| Area | Finding | Severity |
| ---- | ------- | -------- |
| Webhook signatures | Verified before store (`signatures.ts`) | OK |
| Idempotency | Unique `(provider, event_id)` + claim/finish | OK |
| Duplicate charges | Open-invoice reuse + unique idempotency keys per attempt | OK (monitor) |
| Concurrent plan changes | DB prepare + Stripe pending_if_incomplete | Residual race P2 |
| Interval switch | Fixed: omit `billing_cycle_anchor=unchanged` on interval change | Fixed this session |
| Frontend prices | Ignored; server uses price book + Stripe | OK |
| Tenant isolation | `billing.view` / `billing.manage` + company_id | OK |
| Contact email | Requires `billing.view` for authenticated | Fixed in readiness migration |
| Card data | Never stored; Checkout / hosted invoice / portal | OK |
| Cron secret | Bearer only; not logged | OK — must be set in host |
| Live keys | Gated by `STREAKBOOKS_ALLOW_LIVE_PAYMENT_KEYS` | OK |
| Entitlements | Server RPCs / posting paths remain authority | OK (SQL suites when Docker available) |

---

## 7. Environment variables (names only)

Required for billing production:

- `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- `STREAKBOOKS_CRON_SECRET` (+ optional `_PREVIOUS`)
- `APP_ORIGIN` / site URL for return URLs
- Optional: `RESEND_API_KEY`, `EMAIL_FROM`, Razorpay trio, `STREAKBOOKS_ALLOW_LIVE_PAYMENT_KEYS`
- Test only: `STRIPE_TEST_CLOCKS=1` or `full`

---

## 8. Automated test results (this session)

| Check | Result |
| ----- | ------ |
| `npm run typecheck` | Passed |
| `npm test -- --run src/lib/billing` | Passed after OpenAPI regen + clients mock update |
| Stripe Test Clocks `full` | **6 passed** (1 skipped = docs-only when clocks off) |
| `npm run test:billing:postgres` | **Blocked** — Docker daemon not running |
| Live Supabase migration list/apply | **Blocked** — StreakBooks project not in MCP |
| UI E2E A–J | **Blocked** — needs your authenticated browser |

---

## 9. Outstanding risks / limitations

1. **Migrations not applied** on live Supabase — plan-change v2 RPCs fail until you apply them.
2. **Webhook-retry cron** not defined in-repo — must be configured on the host.
3. **Postgres billing SQL suites** not re-run here (Docker down); new assertions added in `billing-04-provider-payments.sql`.
4. **UI E2E A–J** need your authenticated browser session.
5. Platform invoices remain paid/credited only; open/failed live in the Stripe list panel.
6. Year→month Stripe update without `billing_cycle_anchor` may reset the billing cycle (Stripe constraint); product copy should stay clear that interval switches can restart the cycle.

---

## Production readiness claim

**Not production-ready until:** migrations applied on staging then prod, webhook-retry scheduled and verified, Stripe test-mode UI journeys A–G green, owner go-live checklist in `13-runbook.md` completed, and `test:billing:postgres` green with the new migrations.

Typecheck + unit tests alone are **not** sufficient. Test Clock API journeys **passed** in this session; they do not replace webhook/DB sync validation.
