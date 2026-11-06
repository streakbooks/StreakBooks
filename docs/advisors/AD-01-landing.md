# AD-01 — Advisors landing and service selection

## Intent

Ship a public LinkBooks Advisors entry point with exactly two services, original illustrations, persisted catalogue defaults, and selection that never opens a chatbot.

## Surface

- `/advisors` — landing with brand, heading, supporting copy, two service cards
- `/advisors/bookkeeping` and `/advisors/coaching` — selection confirmation, plan preview, exclusions

## Persistence

Migration `20261106120000_advisors_services_catalogue.sql` adds:

- `advisors_services` / `advisors_service_plans`
- RLS select for published rows only
- `list_public_advisor_services()` for anon/authenticated execute

Frontend falls back to `DEFAULT_ADVISOR_SERVICES` when Supabase is unavailable so public UI fixtures stay offline-safe.

## Out of scope

Chatbot, booking, admin draft/publish UI, billing capture, customer portal.
