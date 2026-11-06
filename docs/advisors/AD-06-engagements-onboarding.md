# AD-06 — Proposals, agreements and onboarding

## Customer flow

1. Admin creates an engagement for an Advisors client and sends a priced proposal.
2. Customer opens `/advisors/proposal/$token`, accepts or declines.
3. Acceptance presents `/advisors/agreement/$token` with explicit consent.
4. Agreement acceptance moves the engagement to `onboarding` and seeds service-specific tasks.
5. Completing/skipping all onboarding tasks moves the engagement to `active`.

Accepting a proposal or agreement **does not** start a paid subscription or capture payment (AD-07).

## Admin

| Route | Purpose |
| --- | --- |
| `/advisors-admin/engagements` | Create engagements, draft/send proposals, inspect agreements |
| `/advisors-admin/onboarding` | Track and update onboarding checklist tasks |

## Persistence

Migration `20261106170000_advisors_engagements_onboarding.sql`:

- `advisors_engagements`, `advisors_proposals`, `advisors_agreements`, `advisors_onboarding_tasks`
- Public token RPCs for proposal/agreement with rate limits
- Platform RPCs gated by `billing.view` / `billing.manage`
- Overview metrics for open proposals and onboarding engagements

Document file upload storage continues to reuse the existing documents subsystem in AD-08; AD-06 records document *requests* on onboarding tasks.
