# LinkBooks deterministic voice — production release gate

**Current status: NOT READY TO DEPLOY.** The feature remains gated off by default.
Passing unit tests, typecheck, and build does not certify financial safety.

## Required release evidence (all must pass)

- [ ] Identify the hosting provider, active deployment URL, and exact production Git SHA.
- [ ] Verify whether the connected Supabase project is production; use a **separate** staging project with synthetic companies, users, contacts, and bank entries.
- [ ] Implement server-owned, durable workflow state keyed by authenticated actor and organisation; test refresh, expiration, cancellation and organisation switching.
- [ ] Resolve contacts by ID and validate document line items, currencies, tax rates, accounting periods and rounding before any save.
- [ ] Implement financial writes through existing authorised domain services and posting engine, not directly from transcript or client-provided company IDs.
- [ ] Persist an immutable proposal and digest, require an on-screen confirmation tied to that proposal, and enforce server-side step-up for higher-risk actions.
- [ ] Implement unique, transactional idempotency, concurrency locking and consumed confirmation tokens; test repeated requests and parallel races.
- [ ] Write immutable audit events with actor, organisation, intent, proposal digest, outcome, and correlation ID; redact transcripts and sensitive content.
- [ ] Test cross-tenant denial, permission revocation, stale sessions, forged confirmations, replay, locked periods, invalid tax, and balanced journals.
- [ ] Run unit, integration, browser E2E and accessibility checks against isolated staging, including voice-unavailable text fallback.
- [ ] Investigate Supabase security-advisor warnings and npm high/critical dependency advisories, with documented remediations.
- [ ] Verify rollback, monitoring, incident response and backups before controlled feature-flag rollout.

## Explicit deployment rules

1. Never apply schema changes or synthetic transactions to an unclassified Supabase project.
2. Never enable voice financial writes on production until the release evidence above is complete.
3. Keep `VITE_VOICE_ASSISTANT_ENABLED` disabled by default.
4. Browser speech recognition may use a third-party speech provider. Do not claim fully local speech or confidential transcription.
5. Never treat passing CI as permission to deploy incomplete financial capabilities.
6. Production deployment requires verified hosting access, environment configuration and a tested rollback path.

## Existing implementation

- Deterministic navigation and read-only review via authenticated server functions.
- Browser speech and text fallback; local-only, unsaved invoice and bill previews.
- Four-tier execution proposal validator and tests (not connected to a durable write gateway).
- GitHub CI with typecheck, unit tests, build and runtime dependency audit.

This document is a release checklist, not an assertion that the listed capabilities exist.
