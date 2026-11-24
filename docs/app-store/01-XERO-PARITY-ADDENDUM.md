# StreakBooks App Store — Xero-Parity Addendum

**Status:** Integrated into roadmap (AS-XP-01 … AS-XP-10)  
**Design policy:** Functional completeness benchmarked against Xero; **original StreakBooks UX only**.  
**Parity rule:** Do **not** declare Xero-level feature parity until each capability is implemented **and** independently verified. External API access, partnerships and marketplace adoption remain separate.

## Capability map

| ID | Capability | Gap vs current StreakBooks | Target batch | Verification bar |
|---|---|---|---|---|
| XP-01 | Universal App Launcher | Missing global launcher | AS-XP-01 / AS-02 | Org-aware list of installs + connection status from anywhere |
| XP-02 | Accountant App Advisory | Missing firm→client app recommend/monitor | AS-XP-02 / AS-05 | Firm can recommend, request approval, monitor authorized clients only |
| XP-03 | Seamless App Onboarding | Request-only; no OAuth wizard | AS-02 / AS-XP-03 | One-click start, OAuth/SSO when credentials exist; no fake success |
| XP-04 | App Certification Program | Missing | AS-XP-04 / AS-06 | Formal criteria + reassessment schedule; no self-certify |
| XP-05 | Developer Partner Program | Publisher tables only | AS-XP-05 / AS-05 | Tiers, API levels, entitlements, commercial policy acceptance |
| XP-06 | API Usage & Monetization | Scope catalogue only | AS-XP-06 / AS-05 | Quotas, metering, rate limits, alerts; billing separate from SaaS |
| XP-07 | Publisher Growth Analytics | Missing | AS-XP-07 / AS-05 | Genuine events only — no fabricated impressions/reviews |
| XP-08 | Advanced Integration Quality | Scaffold adapters only | AS-XP-08 / AS-03–04 | Sandbox, reconciliation, sync recovery, webhook reliability, regression |
| XP-09 | Compatibility & Version Mgmt | Missing app_versions | AS-XP-09 / AS-05 | API versions, warnings, staged release, rollback, deprecation |
| XP-10 | Marketplace Trust & Safety | Partial (honest status) | AS-XP-10 / AS-01+ | Verified publisher, certified badge, privacy, incident, suspension |

## Acceptance criteria (addendum)

| ID | Requirement |
|---|---|
| AC-XP-01 | App Launcher available from authenticated shell; org-scoped; shows connection health |
| AC-XP-02 | Accountant advisory recommendations require firm authorization and client approval |
| AC-XP-03 | Onboarding never reports connected unless OAuth/API validation succeeds |
| AC-XP-04 | Certification statuses are admin-assigned; reassessment dates enforced in catalogue |
| AC-XP-05 | Partner tiers gate API access levels without service-role credentials |
| AC-XP-06 | Usage events and quotas are recorded; alerts fire before hard limits |
| AC-XP-07 | Analytics events are append-only and sourced from real user/actions |
| AC-XP-08 | Quality gates block `e2e_verified` until sandbox + reconciliation checks pass |
| AC-XP-09 | Incompatible app versions show warnings; deprecation dates are visible |
| AC-XP-10 | Trust indicators (verified publisher, certified, suspended) render on listings |
| AC-XP-11 | Xero parity **not** claimed until AC-XP-01…10 independently verified |
| AC-XP-12 | Original StreakBooks design language preserved (no competitor UI reproduction) |

## Non-duplication notes

- Reuse App Store catalogue, installations, connections, developer publishers/OAuth, public API scopes.
- Do not overload StreakBooks SaaS `billing_*` for marketplace usage — bridge later like Advisors if needed.
- Firm advisory uses practice client authorization patterns; do not invent a second firm model.
- Stripe merchant connector remains distinct from platform billing Stripe.

## Progress honesty

As of this addendum integration:

- XP-01: implemented (launcher UI + data binding to catalogue installs)
- XP-02: foundation (schema + firm advisory screens; live multi-client monitoring pending)
- XP-03–09: schema/roadmap foundations; runtime OAuth/usage/billing/quality gates pending
- XP-10: catalogue trust fields + UI badges; incident workflow pending
- **Xero-level parity: NOT declared**
