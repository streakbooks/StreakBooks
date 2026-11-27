# Mid-cycle plan upgrade — verification evidence (PR #98)

**Head commit:** `50cd7dc0` on `feature/qb-midcycle-plan-upgrade`  
**Status:** **Not production-ready.** Automated sandbox + SQL passed; **authenticated staging workflows A/B await your manual runs.**  
**Rules:** Test-mode only (`sk_test_`, `rzp_test_`). Never set `STREAKBOOKS_ALLOW_LIVE_PAYMENT_KEYS=true`. Do not merge or deploy production from this evidence alone.

---

## CI (GitHub Actions) — run `46042014608` @ `50cd7dc0` (completed)

| Job | Result | Notes |
| --- | --- | --- |
| `browser-fixtures` | **Pass** | |
| `postgres` (platform/POS/banking/workflows/firm-access) | **Pass** | All five |
| `validate` → typecheck | **Pass** | `tsc --noEmit` |
| `validate` → lint | **Fail** | `eslint .` Prettier baseline debt (also on `main`); job stops here |
| `validate` → build / module gates | **Not run** | Skipped after lint failure |
| Vercel Preview build | **Pass** | Preview deployment build succeeded (see below) |
| Cloudflare Workers Builds | **Fail** | External Workers preview; not app billing gate |
| Supabase Preview | Skipped | |

**Lint policy:** PR-touched files stay Prettier-clean. Do **not** mass-format the repo on this branch.

---

## Vercel Preview deployments (@ `50cd7dc0`)

| Project (GitHub check) | State | URL / inspect |
| --- | --- | --- |
| **Vercel – streakbooks** (`paxaris/streakbooks`) | **Ready** | **Use alias:** https://streakbooks-git-feature-qb-midcycle-plan-upgrade-paxaris.vercel.app · Deployment: https://streakbooks-f11oakpvs-paxaris.vercel.app · Inspect: https://vercel.com/paxaris/streakbooks/E17J97iPjmZhfKNKN175GFe9AjiU |
| **Vercel – streak-books** | **Ready** (GitHub check) | Inspect: https://vercel.com/streak-books/streak-books/23dVdGJAczPQN1Xak4vJCVn728LY |

**Agent verification notes**

- CLI `vercel inspect` on `dpl_E17J97iPjmZhfKNKN175GFe9AjiU`: **Ready**, preview, branch alias attached.
- Alias is SSO-protected (Vercel Authentication). Sign in with team access before running Workflows A/B.
- Prefer the **git branch alias** (stable across redeploys) over the ephemeral `*.vercel.app` deployment host.

---

## Scenario matrix (automated + staging)

| # | Scenario | Result | Notes |
| --- | --- | --- | --- |
| R1 | Razorpay test credentials | **Pass** | `npm run verify:razorpay` |
| R2 | Card / UPI / e-mandate identification | **Pass** | `RAZORPAY_SANDBOX=1` |
| R3 | Immediate card upgrade (charged amount) | **Awaiting Workflow A** | Pre-auth API subs cannot prove charge |
| R4 | UPI / e-mandate unsupported | **Pass** | App fail-closed |
| R5 | Failure / delayed / duplicate webhook | **Pass (SQL/sig)** | billing-04 + HMAC |
| R6 | Razorpay amount, tax, renewal | **Awaiting Workflow A** | Capture sheet below |
| R7 | Entitlements after provider confirm | **Pass (SQL)** | `pending_payment` ≠ plan change |
| S1 | Authenticated Settings UI upgrade | **Awaiting Workflow B** | Needs `E2E_*` |
| S2–S5 | Stripe Test Clock journeys | **Pass** | `test:billing:sandbox:stripe` 6/1 |
| S6 | 3DS recovery | **Awaiting Workflow B** | Use SCA test card |
| D1–D3 | Lock / idempotency / rollback | **Pass** | SQL + stable Idempotency-Key |
| C1 | PR-touched lint | **Pass** | Full-repo lint still fails on `main` debt |

---

## Workflow A — Razorpay authenticated card upgrade (India)

### Prerequisites (you configure; do not paste secrets into chat)

1. Razorpay Dashboard → **Test Mode** (toggle top-left).
2. Local/staging env already has `RAZORPAY_KEY_ID=rzp_test_…`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `RAZORPAY_MODE=test`.
3. Webhook URL points at the **preview or tunnel** hosting this branch:  
   `POST https://<APP_ORIGIN>/api/billing/razorpay`  
   Events: `subscription.authenticated`, `subscription.activated`, `subscription.charged`, `subscription.updated`, `subscription.pending`, `subscription.halted` (see `docs/billing/22-razorpay-test-mode-setup.md`).
4. App under test: prefer **paxaris preview** (after Vercel SSO) or `http://localhost:8080` on this branch.

### Steps

1. **Create Indian staging organisation**
   - Sign in → **Onboarding / Create organisation**.
   - Country: **India (IN)**.
   - Name e.g. `SB Razorpay Card Upgrade QA`.
   - Open **Settings → Subscription**.

2. **Subscribe Standard Monthly via Card**
   - Interval: **Monthly**.
   - Plan: **Standard** → **Subscribe**.
   - Payment method: **Card** (Razorpay — not UPI / e-mandate).
   - Complete Razorpay hosted Checkout with a **Test Mode card** from Razorpay docs (Dashboard → Test Mode → payment methods).  
     Do **not** use a live card.
   - Return to StreakBooks; wait until UI shows an **active** subscription (webhook-driven).

3. **Confirm provider activation**
   - Razorpay Dashboard → **Test Mode** → **Subscriptions** → open the new subscription.
   - Confirm status is **authenticated** and/or **active** (capture which).
   - Copy **Subscription ID** (`sub_…`).

4. **Upgrade Standard → Pro (immediate)**
   - Settings → Subscription → **Pro** → **Switch plan**.
   - On **Review your plan change**, capture every field in the sheet below (especially Due today / estimate wording / Next renewal / Provider / Payment method).
   - Click **Change plan** (must **not** say Continue to Stripe).
   - Wait for success / “updating” banner; refresh until plan shows **Pro**.

5. **Verify webhooks + DB**
   - Razorpay Dashboard → **Webhooks** → deliveries for `subscription.updated` (and `subscription.charged` if an add-on charge occurred). Note HTTP 2xx.
   - Supabase project `qugoaaizclvkzesptovm` → SQL (service role / SQL editor):

```sql
select company_id, provider, provider_subscription_id, plan_code, status,
       currency, unit_amount_minor, current_period_end, scheduled_plan_code
from public.company_subscriptions
where provider_subscription_id = '<sub_…>';
```

   - Expect: `provider = razorpay`, `plan_code = pro` (or your Pro code) **only after** webhook success; currency `INR`.

### Capture sheet A (paste into PR comment when done)

| Field | Value |
| --- | --- |
| App URL used | |
| Company name / id | |
| Razorpay subscription id | `sub_` |
| Status after Checkout | authenticated / active |
| Webhook events seen | |
| Preview: remaining days | |
| Preview: due today (UI) | |
| Preview: tax (UI) | |
| Preview: next renewal (UI) | |
| Provider adjustment / charge (Dashboard) | |
| Provider tax (if shown) | |
| `company_subscriptions.plan_code` after confirm | |
| `current_period_end` | |
| Entitlements match Pro? (users limit etc.) | yes / no |
| Any Stripe CTA shown? | must be **no** |
| Pass / Fail | |

---

## Workflow B — Stripe authenticated upgrade (UK)

### Prerequisites

1. Stripe Dashboard → **Test mode**.
2. Env: `STRIPE_SECRET_KEY=sk_test_…`, webhook secret for `/api/billing/stripe` (or existing staging wiring).
3. Dedicated **UK** staging user + organisation (country **GB**).  
4. Put credentials **only** in local env (never commit, never paste into chat):

```bash
# .env.local (gitignored)
E2E_BILLING_ENABLED=true
E2E_BILLING_MUTATIONS=true
E2E_BASE_URL=https://streakbooks-git-feature-qb-midcycle-plan-upgrade-paxaris.vercel.app
# or http://localhost:8080
E2E_EMAIL=…
E2E_PASSWORD=…
E2E_BILLING_COUNTRY=GB
```

5. Optional automation after manual subscribe:

```bash
npm run test:billing:live
```

### Steps

1. **Create / open UK organisation**
   - Country **United Kingdom**.
   - Settings → Subscription — methods must be Stripe card only (no UPI).

2. **Subscribe Standard Monthly**
   - Subscribe → Stripe Checkout.
   - Card: `4242 4242 4242 4242`, any future expiry, any CVC, any postal code.
   - Wait for active subscription (webhook / confirm return).

3. **Standard → Pro monthly upgrade**
   - Switch to **Pro** → review modal (**Confirm and pay** / Stripe path OK; never Razorpay).
   - Capture due today, tax, next renewal, recurring price.
   - Complete payment if hosted invoice / 3DS appears.
   - Confirm UI plan = Pro; Stripe subscription item price = Pro monthly.

4. **Annual upgrade / interval**
   - Toggle **Yearly** → Switch plan on a higher annual price (or Pro yearly).
   - Capture preview; confirm; verify invoice + period behaviour (anchor rules).

5. **Payment failure**
   - Stripe Customer → default payment method → use decline test card `4000 0000 0000 0341` (or attach via Customer Portal **Manage billing** if exposed).
   - Trigger renewal/upgrade that charges; expect past_due / recovery UI; restore `4242…`.

6. **3DS (where supported)**
   - Use Stripe test card that requires authentication, e.g. `4000 0025 0000 3155` (confirm against current Stripe test-card docs).
   - Complete 3DS challenge on hosted invoice/Checkout.
   - Entitlements must flip **only after** payment succeeds (not on redirect alone).

### Capture sheet B

| Field | Value |
| --- | --- |
| App URL | |
| Company / user (email only) | |
| Stripe customer id | `cus_` |
| Stripe subscription id | `sub_` |
| After monthly upgrade: invoice id / amount_due / tax | |
| Next renewal (`current_period_end`) | |
| Annual change: invoice / period | |
| Failure card result | |
| 3DS card + outcome | |
| DB `plan_code` / `provider=stripe` | |
| `npm run test:billing:live` result | pass / skip / fail |
| Pass / Fail | |

---

## How to re-run automation (no live keys)

```bash
npm run verify:razorpay
npm run test:billing:sandbox:razorpay
npm run test:billing:sandbox:stripe
npm run test:billing:postgres
# After you set E2E_* locally:
npm run test:billing:live
```

---

## What I need from you (exact)

1. Complete **Workflow A** capture sheet (India + Razorpay Test Mode **Card**).
2. Complete **Workflow B** capture sheet (UK + Stripe Test Mode).
3. Confirm Vercel SSO access to  
   https://streakbooks-git-feature-qb-midcycle-plan-upgrade-paxaris.vercel.app  
   and that Settings → Subscription loads.
4. Optionally paste **redacted** capture sheets into PR #98 (subscription ids OK; **no** API secrets / passwords).

---

## Production readiness checklist

- [x] Test-mode keys only; no production deploy; no merge
- [x] Automated Stripe Test Clock + Razorpay sandbox connectivity + SQL pending/dedupe
- [x] GitHub `browser-fixtures` + postgres green; validate fail classified as baseline lint debt
- [x] Vercel preview **Ready** for paxaris `streakbooks` (SSO-protected)
- [ ] Workflow A fully Pass (authenticated Razorpay card upgrade + webhook + DB)
- [ ] Workflow B fully Pass (UI monthly + annual + failure + 3DS where supported)
- [ ] Ops sign-off on this document

**Verdict:** **Not production ready** until Workflows A and B are recorded as Pass.
