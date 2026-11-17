# Post-implementation gap analysis (2026-11-17)

Compared delivered branch work to the master directive, Phase 0 PRD and competitor matrix.

## Delivered (code present)

- Unified `messaging_*` schema, RLS, durable outbox, DM/group/record/portal RPCs  
- Permissions, access catalogue, feature catalogue, demo enablement  
- Messages workspace + Discuss on invoice/PO/bill/claim/quote/contact/leave/credit-note/journal  
- Membership lifecycle: add/remove/leave/mute durations/archive/unarchive/rename/star  
- Block/unblock UI; report; export; drafts; Ctrl/⌘+Enter  
- Action Center fan-out; read receipts; formal approval handoff  
- AI/voice fail-closed; attachments; pins; SafeMessageBody  
- Portal Message Business bridges; presence/typing/reactions/edit/redact/reply  
- Notification prefs + browser permission helper + digest/retention cron workers  
- Latest-window pagination + load-older; membership-scoped global message search  
- Desktop notify (hidden tab + push opt-in + quiet hours); demo messaging banner; aria-live  
- Mark all read; message deep links; Open record; supplier payment Discuss; typing channel fix  
- Drag/drop + paste attachments; copy link; leave confirm; relative times; sales receipt Discuss  
- Analytics, performance budgets, rate limits  
- Unit/integration scaffolds and gated E2E  

## Essential gaps before production claim

| Gap | Severity | Notes |
| --- | -------- | ----- |
| Migrations not applied to staging/prod | Blocker | SQL only on branch (11 files) |
| Two-browser realtime E2E | Blocker for Phase 1 acceptance | Scaffolded; not run live |
| Live cross-tenant RLS harness | Blocker for security verified | Structural script only |
| Firm multi-client isolation E2E | High | Gated scaffold; live isolation unproven |
| Digest/purge live proof | Medium | Needs cron secrets + migrated DB |
| Voice/video provider | Low | Explicitly optional / fail-closed |
| Performance budgets measured live | Medium | Budgets defined; not measured on staging |

## Honest status

The branch is a **production-oriented foundation**, not a production-verified complete system. Do not enable customer/vendor portals messaging in production until external auth tests and RLS isolation pass on a live database.
