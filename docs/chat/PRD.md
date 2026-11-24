# StreakBooks Messaging — Product Requirements

## Vision

One secure, multi-tenant collaboration platform inside StreakBooks. Familiar chat UX; enterprise authorization, auditability and accounting-safe workflows.

## Participants

1. Business owners / administrators  
2. Accounting and finance users  
3. Employees, HR, managers (via membership + HR mapping; employee record ≠ chat account)  
4. Accountants, bookkeepers, firms  
5. Customer portal users (explicit invite only)  
6. Vendor portal users (explicit invite only)  
7. Advisors and professional service providers (engagement-scoped)

## Core capabilities

- Direct messages and groups/channels  
- Transaction-linked discussions with explicit visibility modes  
- Secure attachments (private storage, membership-gated)  
- Mentions, unread, star, archive, mute  
- Real-time delivery (Broadcast/postgres_changes) with durable PostgreSQL history  
- Formal approvals via existing engines (chat text never posts/pays)  
- Notifications via Action Center + preferences  
- Optional AI assist behind permissions and opt-in  
- Settings Centre administration + subscription entitlements (3 plans + trial)

## Non-goals

- Separate messaging databases per audience  
- Chat-driven ledger mutations  
- Public realtime channels for private business data  
- Copying competitor UI/assets  
- Declaring compliance certifications from technical controls alone  

## User stories (selected)

| ID | Story | Acceptance |
| -- | ----- | ---------- |
| US-1 | As a member I DM a colleague | Message persists; peer sees it in realtime; other companies cannot read |
| US-2 | As a manager I create a Finance group | Only invited members participate; leavers lose access |
| US-3 | As a customer I discuss an invoice | Conversation linked to invoice; no other customers visible |
| US-4 | As a vendor I query a PO | Purchasing team notified; bank details never exposed |
| US-5 | As an accountant I message Client A | Client B conversations inaccessible |
| US-6 | As finance I request bill approval from chat | Creates formal approval task; "approved" in text does nothing |
| US-7 | As admin I disable messaging | Feature flag + settings block create/send |
| US-8 | As HR I discuss leave privately | Payroll/salary channels require restrictive perms |

## Phase acceptance (summary)

See PHASE-CHECKLIST.md. Completion requires verified evidence in PROGRESS-TRACKER.md, not commit counts.
