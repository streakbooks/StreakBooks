# LinkBooks Advisors — gap analysis

**Date:** 6 November 2026 · **Baseline:** `main` @ `5089800` · **Repo:** https://github.com/linkbusinessadvisory/LinkBooks

## Audit summary

No Advisors customer product exists in this repository. Searches for Advisors routes, screens, migrations, assets and product docs returned no dedicated implementation. Related platforms that must be **reused, not replaced**:

| Area | Status | Reuse notes |
| --- | --- | --- |
| Public pricing (`/pricing`) | Done | Pattern for public catalogue + server fn + graceful DB-off fallback |
| Billing catalogue / subscriptions / invoices | Done | Integrate in AD-07; do not invent a second payment engine |
| Firm / practice workspace (`/firm`) | Partial | Accountant firm portfolio — distinct from Advisors service delivery |
| Documents / files | Done | Reuse for onboarding uploads (AD-06 / AD-08) |
| Auth + portal login | Done | Customer portal (AD-09) must use existing session / RLS model |
| Authenticated AI assistant | Partial | Advisors chatbot (AD-03) must use verified AI infra; never auto-open on landing |
| Appointment / calendar product | Missing | Native booking required in AD-04 |
| Advisors landing / services / plans | Missing | AD-01 / AD-02 |
| Advisors admin dashboard | Missing | AD-05 onward |

## Roadmap gaps (AD-01 … AD-10)

| Batch | Required outcome | Current status |
| --- | --- | --- |
| AD-01 | Public landing, two services, original art, selection without chatbot | **Missing — implementing now** |
| AD-02 | Bookkeeping + coaching plans, editable admin pricing | Missing |
| AD-03 | Post-selection AI Advisor chat, qualification, lead capture | Missing |
| AD-04 | Native appointment booking with conflict protection | Missing |
| AD-05 | Inquiry / customer / advisor management console | Missing (firm ≠ Advisors) |
| AD-06 | Proposals, agreements, onboarding | Missing |
| AD-07 | Billing / subscriptions via existing billing | Missing Advisors SKUs |
| AD-08 | Advisor workspaces, tasks, documents, delivery | Missing |
| AD-09 | Customer portal, notifications, optional calendar OAuth | Missing |
| AD-10 | Security, reliability, performance, release verification | Pending after batches |

## CI trigger status

`.github/workflows/quality.yml` is fully commented out (`on:` / jobs inactive). Automatic GitHub Actions are not currently triggered by push or pull request. Local scripts remain the verification path per product instruction.

## Non-goals for AD-01

Chatbot, booking, admin console, paid subscription start, competitor UI/artwork copy, regulated tax/audit claims.
