# StreakBooks Advisors — gap analysis

**Date:** 6 November 2026 · **Baseline:** `main` @ `5089800` · **Working branch:** `feature/advisors-ad-04-appointment-booking` · **Repo:** https://github.com/streakbooks/StreakBooks

## Audit summary

Advisors AD-01…AD-10 are implemented on the working branch (local + linked remote SQL for later batches). Related platforms were **reused, not replaced**:

| Area | Status | Reuse notes |
| --- | --- | --- |
| Public pricing (`/pricing`) | Done | Pattern for public catalogue + server fn + graceful DB-off fallback |
| Billing catalogue / subscriptions / invoices | Done | AD-07 bridges Advisors SKUs into existing checkout — no second payment engine |
| Firm / practice workspace (`/firm`) | Partial | Accountant firm portfolio — distinct from Advisors service delivery |
| Documents / files | Done | Onboarding/delivery document requests; binary uploads via linked company Files |
| Auth + portal login | Done | AD-09 customer portal uses existing session + `linked_user_id` |
| Authenticated AI assistant | Partial | AD-03 Advisors chat uses verified AI infra; does not auto-open on landing |
| Appointment / calendar product | Done | Native AD-04 booking; Google/Microsoft OAuth still optional/deferred |
| Advisors landing / services / plans | Done | AD-01 / AD-02 |
| Advisors admin dashboard | Done | AD-05 onward under `/advisors-admin` |

## Roadmap (AD-01 … AD-10)

| Batch | Required outcome | Current status |
| --- | --- | --- |
| AD-01 | Public landing, two services, original art, selection without chatbot | Implemented |
| AD-02 | Bookkeeping + coaching plans, editable admin pricing | Implemented |
| AD-03 | Post-selection AI Advisor chat, qualification, lead capture | Implemented |
| AD-04 | Native appointment booking with conflict protection | Implemented (committed through `a1af61b`) |
| AD-05 | Inquiry / customer / advisor management console | Implemented locally — remote SQL applied |
| AD-06 | Proposals, agreements, onboarding | Implemented locally — remote SQL applied |
| AD-07 | Billing / subscriptions via existing billing | Implemented locally — remote SQL applied |
| AD-08 | Advisor workspaces, tasks, documents, delivery | Implemented — remote SQL `20261106190000` |
| AD-09 | Customer portal, notifications, optional calendar OAuth | Implemented — remote SQL `20261106200000`; OAuth deferred |
| AD-10 | Security, reliability, performance, release verification | Implemented — remote SQL `20261106210000` + `20261106211000` (anon revoke) + `verify:advisors` + production build |

## Publishing status

AD-05…AD-10 (and related docs/scripts) remain **uncommitted / unpublished** on `feature/advisors-ad-04-appointment-booking`. Pulling `main` will not retrieve them. Commit, push, PR, and GitHub CI require explicit authorization.

## CI trigger status

`.github/workflows/quality.yml` is fully commented out (`on:` / jobs inactive). Automatic GitHub Actions are not currently triggered by push or pull request. Local scripts remain the verification path: `npm run verify:advisors`.

## Remaining product follow-ups (not blocking AD-10 code)

- Live browser smoke across admin, booking, portal invite, and Resend reminders
- Optional Google/Microsoft calendar OAuth
- Commit / PR / merge when authorized
- Independent accountant / jurisdiction sign-off outside this engineering batch
