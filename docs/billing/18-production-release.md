# StreakBooks billing — controlled production release

**Date:** 2026-11-27  
**Goal:** Controlled production release of existing billing (no feature rewrite).  
**Verdict:** **Not production-ready until** staging/prod migrations are applied, Vercel cron is verified live, and authenticated UI E2E mutations complete.  
Local Docker SQL suites and Stripe Test Clocks are green.

---

## 1. Code implementation status

| Area | Status |
| ---- | ------ |
| Plan change (upgrade / downgrade / interval / preview / reverse) | **Completed and verified** (unit + Stripe Test Clocks) |
| Past-due recovery + contact email permission | **Implemented** (migration readiness file; apply pending) |
| Invoice visibility (Stripe open/paid/void/proration + platform PDFs) | **Completed** (code); UI E2E **not executed** without credentials |
| Webhook store / retry / dead-letter | **Completed** (code + SQL suite historically); cron host config **pending verify** |
| Vercel Cron route compatibility (GET + POST) | **Implemented this release prep** |
| `vercel.json` cron every 5 minutes | **Implemented this release prep** — deploy to activate |
| Live Playwright A–J suite | **Implemented** — **not executed** (needs `E2E_BILLING_ENABLED`) |

Preserve accounting engine behaviour: `is_demo` gating rules unchanged; no rewrite of payment pipeline.

---

## 2. Migration status

| File | Order | Applied staging? | Applied production? |
| ---- | ----- | ---------------- | ------------------- |
| `supabase/migrations/20261127083000_billing_plan_change_v2.sql` | 1 | **Pending — manual** | **Do not auto-apply** |
| `supabase/migrations/20261127090000_billing_production_readiness.sql` | 2 | **Pending — manual** | **Do not auto-apply** |

### Verification (static)

| Check | Result |
| ----- | ------ |
| Execution order | Timestamp order; readiness must follow v2 |
| SQL syntax | Valid PL/pgSQL |
| Backward compatibility | `billing_prepare_plan_change(uuid, text)` via `_interval DEFAULT NULL` after `DROP` of 2-arg |
| Existing subscriptions | RPC-only; no row rewrites of `company_subscriptions` amounts/status |
| RLS / tenant isolation | `SECURITY DEFINER` + `has_company_permission` / service_role grants |
| Rollback | Forward-fix preferred; restore PITR backup if needed (no destructive down migration shipped) |

### Staging apply (run first)

```bash
cd ~/Projects/streakbooks
# Confirm linked project is STAGING, not production
supabase link --project-ref <STAGING_PROJECT_REF>
supabase db push --dry-run
supabase db push
```

Or paste **v2 then readiness** in the staging SQL editor.

Smoke:

```sql
select public.billing_prepare_plan_change('<company_uuid>', 'pro', 'year');
select public.billing_clear_scheduled_plan_change('<company_uuid>');
```

### Production apply (only after staging OK — never automatic)

```bash
supabase link --project-ref <PRODUCTION_PROJECT_REF>
# Confirm PITR / backup
supabase db push --dry-run
# Explicit operator approval required before:
supabase db push
```

---

## 3. PostgreSQL test readiness

| Item | Detail |
| ---- | ------ |
| Command | `npm run test:billing:postgres` |
| Runtime | Isolated `postgres:17` Docker container, `--network none` |
| Migrations loaded | `*_billing_*.sql` from `20261105161752` onward (includes both 20261127 files) |
| Fixtures | `tests/fixtures/billing/baseline.sql` (+ `created_at` on members), `legacy-catalogue.sql` |
| Suites | `tests/integration/billing-*.sql` aligned with launch-country prices |
| Result (this session) | **All 10 suites passed** (01–10), migrations applied twice |

```bash
# macOS: start Docker Desktop, then:
cd ~/Projects/streakbooks
npm run test:billing:postgres
```

| Suite | Checks |
| ----- | ------ |
| billing-01-accounts | 54 |
| billing-02-plans | 59 |
| billing-03-pricing | 60 |
| billing-04-provider-payments (incl. past_due + clear scheduled) | 56 |
| billing-05-subscriptions | 52 |
| billing-06-tax-invoicing | 60 |
| billing-07-coupons | 37 |
| billing-08-partners | 57 |
| billing-09-api | 34 |
| billing-10-analytics | 19 |

---

## 4. Stripe integration test results

| Suite | Command | Result |
| ----- | ------- | ------ |
| Unit / policy | `npm test -- --run src/lib/billing` | Passed in prior session |
| Test Clocks smoke | `STRIPE_TEST_CLOCKS=1` | Passed |
| Test Clocks full journey | `STRIPE_TEST_CLOCKS=full` | **Passed** (~58s) |

---

## 5. UI E2E test results

| Suite | Command | Result |
| ----- | ------- | ------ |
| Fixture component E2E | `npm run test:billing:e2e` | Partner/analytics fixtures (not Stripe Checkout) |
| Live lifecycle A–J | `npm run test:billing:live` | **Implemented but not executed** — needs credentials |

```bash
E2E_BILLING_ENABLED=true \
E2E_EMAIL=… E2E_PASSWORD=… \
E2E_BASE_URL=http://localhost:8080 \
npm run test:billing:live

# Mutations (Checkout / switch) — Stripe test mode only:
E2E_BILLING_MUTATIONS=true E2E_BILLING_ENABLED=true …
```

Scenarios A–J are encoded in `e2e/billing/subscription-lifecycle.live.spec.ts`.

---

## 6. Webhook cron configuration

| Item | Status |
| ---- | ------ |
| Route | `GET|POST /api/billing/webhook-retry` |
| Auth | Bearer `STREAKBOOKS_CRON_SECRET` (or legacy `LOVABLE_CRON_SECRET`) |
| Overlap | `billing_webhook_claim` uses `FOR UPDATE SKIP LOCKED` |
| Dead-letter | `billing_events.status = dead` after repeated failures; Payment Operations requeue |
| Logging | Structured `console.info` / `console.error` with counts + event ids (no payloads/secrets) |
| In-repo schedule | `vercel.json` → `*/5 * * * *` |

### Vercel compatibility

- Vercel Cron **GETs** the path and sends `Authorization: Bearer <CRON_SECRET>` when `CRON_SECRET` is set.
- Set **identical** values for `CRON_SECRET` and `STREAKBOOKS_CRON_SECRET` on the Vercel project (Production + Preview as needed).
- Deploy must include `vercel.json` for the cron to register.
- Verify after deploy: Vercel → Project → Cron Jobs shows `/api/billing/webhook-retry`.

Manual probe (do not commit the secret):

```http
GET https://<host>/api/billing/webhook-retry
Authorization: Bearer <STREAKBOOKS_CRON_SECRET>
```

Expect `{ "processed": n, "failed": n }` or 401/500 as documented.

---

## 7. Environment variables (names only)

| Name | Required |
| ---- | -------- |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Yes |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | Yes (browser) |
| `STRIPE_SECRET_KEY` (`sk_test_` until go-live) | Yes |
| `STRIPE_WEBHOOK_SECRET` | Yes |
| `STREAKBOOKS_CRON_SECRET` | Yes |
| `CRON_SECRET` | Yes on Vercel (same value as cron secret) |
| `APP_ORIGIN` / site URL | Yes |
| `STREAKBOOKS_ALLOW_LIVE_PAYMENT_KEYS` | Only when intentionally enabling live keys |
| Razorpay trio | If India live |
| `RESEND_API_KEY`, `EMAIL_FROM` | Optional dunning email |

Never log or commit secret values.

---

## 8. Staging deployment checklist

- [ ] Staging Supabase backup / PITR confirmed
- [ ] Apply migration 20261127083000 then 20261127090000 on staging
- [ ] `npm run test:billing:postgres` green locally with Docker
- [ ] Deploy app to staging with test Stripe keys
- [ ] Stripe webhook endpoint → staging `/api/billing/stripe` with test signing secret
- [ ] `STREAKBOOKS_CRON_SECRET` + `CRON_SECRET` set; cron registered; probe 200
- [ ] `E2E_BILLING_ENABLED=true` live suite against staging (read-only then mutations)
- [ ] Manual UI A–J on staging org (Stripe test cards only)
- [ ] Payment Operations: force failed webhook → retry → dead-letter path

---

## 9. Production deployment checklist

- [ ] Staging sign-off complete
- [ ] Production PITR / backup confirmed
- [ ] Apply same two migrations to production (operator-approved)
- [ ] Deploy app with **live** Stripe keys only after `STREAKBOOKS_ALLOW_LIVE_PAYMENT_KEYS=true`
- [ ] Live Stripe webhook signing secret rotated/configured
- [ ] Cron secret set; Vercel Cron active every 5 minutes; first successful run logged
- [ ] Smoke: subscribe test org or platform staff path; plan change; invoice list
- [ ] Monitor: failed payments, webhook dead count, cron 503s for 24–48h
- [ ] Do **not** run mutation E2E against real customer companies

---

## 10. Remaining risks

| Risk | Severity | Mitigation |
| ---- | -------- | ---------- |
| Migrations not applied | **Critical** | Staging then prod apply commands above |
| Cron not actually registered / wrong secret | **High** | Verify Cron Jobs UI + HTTP probe |
| Year↔month may reset Stripe billing cycle | Medium | Documented product behaviour; monitor first switches |
| Live E2E not run | **High** | Run `test:billing:live` + manual A–J |
| Docker SQL not re-run on this machine until Docker up | Medium | Run `test:billing:postgres` before prod |
| Concurrent plan-change race | Low/P2 | Stripe pending_if_incomplete + DB prepare |

---

## Classification legend

| Label | Meaning |
| ----- | ------- |
| **Completed and verified** | Code + automated evidence in this or prior session |
| **Implemented but not executed** | Code/docs present; needs your env to run |
| **Requires manual dashboard access** | Supabase / Stripe / Vercel consoles |
| **Requires production verification** | Post-deploy smoke only |

---

## Observability map (no secrets)

| Signal | Where |
| ------ | ----- |
| Failed payments | `company_subscriptions.status=past_due`; dunning email path; Access banner |
| Failed webhooks | `billing_events.last_error`, status `failed`/`dead` |
| Retry exhaustion | status `dead`; Payment Operations requeue |
| Sync errors | `console.error` in webhook processor; plan-sync after upgrade |
| Failed plan changes | Customer-facing errors; Stripe idempotency friendly messages |
| Duplicate payment prevention | Open invoice reuse + unique idempotency keys |
| Cron failures | HTTP 503 + `Billing webhook retry error` log; info log with counts |

---

*Typecheck / unit tests alone do not equal production readiness.*
