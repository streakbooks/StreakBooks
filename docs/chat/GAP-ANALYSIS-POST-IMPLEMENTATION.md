# Post-implementation gap analysis (2026-11-17)

Compared delivered branch work to the master directive, Phase 0 PRD and competitor matrix.

## Delivered (code present)

- Unified `messaging_*` schema, RLS, durable outbox, DM/group/record/portal RPCs  
- Permissions, access catalogue, feature catalogue key, demo settings enablement  
- Messages workspace, header panel, settings panel, invoice/PO/bill/claim/quote/contact/leave Discuss  
- Membership revoke on company_member status change  
- Action Center fan-out on send  
- Approval handoff helpers that refuse informal “approved” text  
- AI assist fail-closed stub + UI panel  
- Attachment upload/shared-files UI  
- Portal Message Business + purchasing discuss bridges  
- Presence/typing, reactions/edit/redact, reply, leave, mentions insert, connection health  
- Notification preferences + safe digest preview (no send worker yet)  
- Collaboration flags RPC (AI/files/customer/vendor/groups)  
- Unit tests for validation/approvals/adapters/digests/mentions; structural security SQL  
- Gated two-browser + portal E2E scaffolds  

## Essential gaps before production claim

| Gap | Severity | Notes |
| --- | -------- | ----- |
| Migrations not applied to staging/prod | Blocker | SQL only on branch (6 files) |
| Two-browser realtime E2E | Blocker for Phase 1 acceptance | Scaffolded; not run live |
| Live cross-tenant RLS harness | Blocker for security verified | Structural script only |
| Firm multi-client isolation E2E | High | Accountant open UI present; live isolation unproven |
| Push/email digest delivery worker | Medium | Safe preview only; no outbound mailer |
| Voice/video provider | Low | Explicitly optional / evaluated |
| Performance budgets | Medium | Not measured |

## Honest status

The branch is a **production-oriented foundation**, not a production-verified complete system. Do not enable customer/vendor portals messaging in production until external auth tests and RLS isolation pass on a live database.
