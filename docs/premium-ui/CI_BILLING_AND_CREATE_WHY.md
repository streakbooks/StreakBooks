# Why CI fails / why create defects persisted

**Date:** 2026-11-18  
**Org:** `linkbusinessadvisory`  
**Standing merge rule:** `.cursor/rules/merge-without-ci-billing.mdc`

## Why GitHub Actions fail (Batches 25–48)

Jobs complete in ~2 seconds with annotation:

> The job was not started because recent account payments have failed or your spending limit needs to be increased.

**Root cause:** GitHub Actions billing for the organisation — not StreakBooks test failures. Runners never execute `validate` / postgres / browser-fixtures.

**What we do:** After local gates PASS, merge with `--admin`. Do not wait for billing restoration. Do not treat real red tests as billing.

**Billing API:** `gh api orgs/linkbusinessadvisory/settings/billing/actions` returns 404 for this token (insufficient org billing admin scope). Org owners must fix payment/spending limit in GitHub Settings → Billing.

## Why create/UI defects kept resurfacing

| Symptom | Why |
| --- | --- |
| Transfer Vitest broke after Batch 46 | `route-search.test.ts` still imported deleted `banking/transfers` route module after split to `transfers.index` / `transfers.new` |
| Recurring Sheet “came back” risk | Overlay files left on disk after full-page routes shipped; easy to re-import |
| Dual expense create paths | EM module and Purchases `employee-expenses` both offered submit forms; overview still linked “Legacy claims” as primary create |
| Product/claim Create looked broken | Registry routes are path-only; Create menu must append `?create=true` (special-cased). Bare `action.route` consumers land on lists |
| Banking hub felt incomplete | Hub actions were Import CSV only; Spend/Receive/Transfer creates lived only in Create menu / subnav |

Batches 48–50 close these create-route regressions. Remaining programme work is module DoD / Playwright staging / FA+product full-page creates.
