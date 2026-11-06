# AD-03 — Advisors AI qualification chat

## Activation

The chat mounts only on `/advisors/bookkeeping` and `/advisors/coaching` after service selection. It never appears on `/advisors` landing.

## Behaviour

- Service-aware greeting and AI disclosure
- Optional 3–5 qualification questions with skip
- Catalogue-backed plan recommendations only (no invented prices)
- View plans and human-advisor handoff intents
- Consent required before chat persistence
- Minimize / close / reopen

## Persistence

Migration `20261106140000_advisors_chat_leads.sql` stores conversations, messages and leads behind SECURITY DEFINER RPCs with hourly rate limits. Direct table access is revoked from anon/authenticated.

## AI security

Uses LinkBooks deterministic catalogue guidance by default. Existing `src/lib/ai` secrets are not exposed to the browser. Public chats do not read tenant accounting records.
