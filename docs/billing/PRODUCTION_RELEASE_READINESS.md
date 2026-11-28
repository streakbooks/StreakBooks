# StreakBooks Billing — Production Release Readiness

**Date:** 2026-11-27  
**Branch:** `feature/qb-midcycle-plan-upgrade`  
**PR:** https://github.com/streakbooks/StreakBooks/pull/98  
**Base:** `main` @ `44336170` (0 commits behind; PR ahead by mid-cycle upgrade commits)  
**Scope of this PR:** QuickBooks-style mid-cycle plan upgrade confirmation + Razorpay card vs UPI honesty + Stripe proration alignment. **No new database migrations in this PR.**

**Verdict for merge:** **Safe to merge after P0 gates below** — code review found **no open P0 blockers** in the PR diff.  
**Verdict for customer billing / live keys:** **Not ready.** Authenticated staging payment capture (Workflows A/B) and production env/webhook verification remain outstanding. Do **not** enable live payment keys without explicit operator authorisation.

---

## 1. Inspection summary

| Area                  | Finding                                                                                                                                                                                                                    |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provider architecture | India → Razorpay (incl. card); intl → Stripe. Existing `company_subscriptions.provider` is authoritative; checkout refuses a second paid sub; portal refuses Razorpay→Stripe mix-up.                                       |
| Entitlements          | Not unlocked by frontend redirect alone. Stripe: sync after paid / on-file charge or webhook. Razorpay: `pending_payment` event only; plan unlock waits for provider webhooks.                                             |
| Webhooks              | Signature verified (`verifyStripeSignature` / `verifyRazorpaySignature`); invalid bodies not stored; inbox dedupes on `(provider, event_id)`.                                                                              |
| Auth / tenant         | Plan preview/change/cancel/sync require `requireSupabaseAuth` + `assertCompanyPermission(..., "billing.manage")` + UUID company id. Prices resolved server-side via `billing_prepare_plan_change` / `ensureProviderPrice`. |
| Stripe proration      | Preview pins `proration_date`; confirm reuses same unix + 60s idempotency bucket (full price id).                                                                                                                          |
| Razorpay plan change  | Mandate inspected; UPI/e-mandate/unknown fail closed; card may `schedule_change_at=now` (upgrade) or `cycle_end` (downgrade). Amounts shown as **estimates** until Razorpay confirms.                                      |
| Migrations in PR      | **None.** Prior billing migrations (`20261127083000`, `20261127090000`) already on `main` history; apply status on hosted `qugoaaizclvkzesptovm` remains an **ops** concern (see §7).                                      |
| Existing customers    | No row rewrites in this PR; provider lock preserved; downgrades stay period-end; cancel-at-period-end unchanged.                                                                                                           |

---

## 2. Findings by severity

### P0 — Block merge

| ID  | Issue                    | Status |
| --- | ------------------------ | ------ |
| —   | _(none open in this PR)_ | —      |

Cross-tenant access, unsigned webhooks, silent provider migration, entitlement-from-redirect-only, and unsafe migrations were reviewed and are **not** introduced by this PR.

### P1 — Fix before customer billing rollout (not merge-blocking)

| ID    | Issue                                                                                                    | Severity | Fix / mitigation                                                                                |
| ----- | -------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------- |
| P1-01 | Razorpay upgrade UI previously claimed `chargedOnFile` after PATCH without charge proof                  | P1       | **Fixed this session:** `chargedOnFile: false`; toast says plan updates after Razorpay confirms |
| P1-02 | Authenticated India/UK mid-cycle charge evidence (Workflows A/B) not captured                            | P1       | Manual capture on Preview; see `24-midcycle-upgrade-verification.md`                            |
| P1-03 | Hosted Supabase apply status for readiness migrations not confirmed in this session                      | P1       | Operator: verify migrations on `qugoaaizclvkzesptovm` before live billing                       |
| P1-04 | Production webhook endpoints + cron retry host not re-verified here                                      | P1       | Post-merge checklist §9                                                                         |
| P1-05 | Razorpay PATCH has no Stripe-style Idempotency-Key; double-submit mitigated by UI `isPending` only       | P1       | Accept for controlled release; monitor Dashboard; optional later server debounce                |
| P1-06 | CI `validate` lint fails on **repo-wide** Prettier baseline (also on `main`); PR-touched files are clean | P1/ops   | Documented; do not mass-format on this branch                                                   |

### P2 — After controlled release

| ID    | Issue                                                                               |
| ----- | ----------------------------------------------------------------------------------- |
| P2-01 | Richer Razorpay invoice/tax line items when API exposes them                        |
| P2-02 | Additional analytics on plan-change conversion                                      |
| P2-03 | Reactivate-after-cancel polish via Billing Portal (Stripe Test Clocks note item 14) |
| P2-04 | Expand automated coverage for refund/dispute entitlement paths                      |

---

## 3. Fix applied this session

1. **Razorpay honesty:** `changePlanFor` no longer sets `chargedOnFile: true` after a successful PATCH.
2. **SubscriptionPanel:** Razorpay upgrade toast uses a non-success message stating entitlements wait for Razorpay confirmation.
3. **Test alignment:** `stripe-plan-change.test.ts` now asserts stable 60s idempotency keys (matches intentional double-click protection). Stale “unique per attempt” assertion removed — that was a regression against the PR design, not a weakening of coverage.
4. Prettier on `docs/billing/24-midcycle-upgrade-verification.md`.

---

## 4. Automated test evidence (this session)

| Gate                                          | Result                                                                                    |
| --------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `npm run typecheck`                           | **Pass**                                                                                  |
| ESLint on PR-touched source files             | **Pass** (`--max-warnings=0`)                                                             |
| Prettier on PR-touched files                  | **Pass** after formatting verification doc                                                |
| Full-repo `eslint .` / CI `validate` lint     | **Fail** — baseline Prettier debt (not introduced by PR files)                            |
| `vitest` billing unit set (10 files)          | **Pass** after idempotency test update (59 tests when green)                              |
| `npm run test:billing:sandbox:razorpay`       | **Pass** — 5 passed, 1 skipped                                                            |
| `npm run test:billing:sandbox:stripe`         | See run log — requires `STRIPE_SECRET_KEY=sk_test_…` locally; skipped or partial if unset |
| `npm run test:billing:postgres`               | **Pass** — suites 01–10 (54+59+60+56+52+60+37+57+34+19 checks); 16 billing migrations ×2  |
| `npm run build`                               | **Pass**                                                                                  |
| Authenticated staging E2E / live UI mutations | **Not executed** (needs operator credentials + Preview SSO)                               |
| New migrations in PR                          | **N/A** — none                                                                            |

---

## 5. Migration safety

| Item                                  | Result                                                                                          |
| ------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Migrations added by PR #98            | **None**                                                                                        |
| Local Docker billing migrations       | Load and pass SQL suites                                                                        |
| Hosted project `qugoaaizclvkzesptovm` | **Do not auto-apply.** Confirm existing `20261127*` migrations before enabling customer billing |
| Rollback                              | Forward-fix; PITR if needed — no destructive down migrations shipped in this PR                 |

---

## 6. Merge readiness

| Gate                             | Status                                                                       |
| -------------------------------- | ---------------------------------------------------------------------------- |
| P0 open                          | **None**                                                                     |
| Branch up to date with `main`    | **Yes** (0 behind)                                                           |
| Production build                 | **Pass**                                                                     |
| Secrets / `.env` in commit       | **None** (verify `git status` before merge)                                  |
| Safe to merge code to `main`     | **Yes** (with P1 rollout caveats)                                            |
| Safe to enable live payment keys | **No** — await A/B evidence + env/webhook checklist + explicit authorisation |

### Exact merge steps (do **not** run until you authorise)

```bash
# On a review machine after reading this report:
gh pr checkout 98
gh pr checks 98   # expect validate lint fail = baseline; postgres + browser-fixtures + Vercel Ready
gh pr merge 98 --merge
# Or GitHub UI: PR #98 → Merge pull request (merge commit)
```

Admin/bypass merges require your explicit authorisation in-session. This agent will **not** merge without that.

---

## 7. Controlled customer rollout checklist

1. Merge PR #98 after your authorisation.
2. Deploy production **with test-mode keys** (or billing disabled via country `billingEnabled`) until §7.3–7.4 pass.
3. Verify production env: `STRIPE_*` / `RAZORPAY_*` test or live only when authorised; `STREAKBOOKS_ALLOW_LIVE_PAYMENT_KEYS` unset until then; webhook secrets; cron route for webhook retry.
4. Confirm webhook URLs hit production and signatures succeed (Stripe Dashboard + Razorpay Dashboard).
5. Internal subscribe + mid-cycle upgrade smoke (one India Razorpay **card**, one Stripe country) — capture amounts, tax, renewal, DB rows.
6. Enable billing for a **limited** country/customer cohort.
7. Monitor: payment success rate, webhook failures/duplicates, `company_subscriptions` vs provider Dashboard, entitlement mismatches.
8. Expand cohort only after monitoring is clean.
9. **Live keys / real charges:** only after you explicitly authorise after reviewing this report + capture sheets.

---

## 8. Related docs

- `docs/billing/24-midcycle-upgrade-verification.md` — Workflows A/B + capture sheets
- `docs/billing/18-production-release.md` — prior controlled-release notes
- `docs/billing/17-production-readiness-validation.md` — migration/Test Clock notes
- `docs/billing/19-hybrid-provider-architecture.md` — provider lock
- `docs/billing/11-security.md` — security baseline

---

## 9. Outstanding limitations (honest)

- Authenticated payment evidence for mid-cycle Razorpay card charge and Stripe UI upgrade is still **awaiting operator runs**.
- CI org may show `validate` red due to repo-wide Prettier; treat **changed-file** lint + local gates + Vercel Preview build as the merge signal for this PR.
- Cloudflare Workers Builds failure is external to app billing gates.
- Stripe sandbox full journey in _this_ agent environment may skip without `sk_test_` in `.env.local` — prior sessions recorded green Test Clocks with keys present.
