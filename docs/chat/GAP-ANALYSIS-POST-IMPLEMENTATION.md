# Post-implementation gap analysis (2026-11-17)

Compared delivered branch work to the master directive, Phase 0 PRD and competitor matrix.

## Delivered (code present)

- Unified `messaging_*` schema, RLS, durable outbox, DM/group/record/portal RPCs  
- Permissions, access catalogue, feature catalogue key, demo settings enablement  
- Messages workspace, header panel, settings panel, invoice/PO Discuss  
- Membership revoke on company_member status change  
- Action Center fan-out on send  
- Approval handoff helpers that refuse informal “approved” text  
- AI assist fail-closed stub  
- Unit tests for validation/approvals; structural security SQL  

## Essential gaps before production claim

| Gap | Severity | Notes |
| --- | -------- | ----- |
| Migrations not applied to staging/prod | Blocker | SQL only on branch |
| Two-browser realtime E2E | Blocker for Phase 1 acceptance | Not authored/run |
| Live cross-tenant RLS harness | Blocker for security verified | Structural script only |
| Attachment upload UI | High | Bucket created; UI missing |
| Portal “Message Business” UI wire-up | High | RPC exists; portal screens still use `portal_messages` |
| Firm multi-client isolation E2E | High | Adapter path incomplete |
| Typing/presence/reactions/edit/redact UI | Medium | Schema partial; UI incomplete |
| Push/email digests | Medium | Prefs table only |
| Voice/video provider | Low | Explicitly optional / evaluated |
| Performance budgets | Medium | Not measured |

## Honest status

The branch is a **production-oriented foundation**, not a production-verified complete system. Do not enable customer/vendor portals messaging in production until external auth tests and RLS isolation pass on a live database.
