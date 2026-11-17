# Messaging security & privacy threat model

## Assets

Message bodies, attachments, participant lists, record links, notification previews, search indexes, audit logs.

## Threats & controls

| Threat | Control |
| ------ | ------- |
| Cross-tenant read/write | company_id on every row; RLS; RPC asserts membership |
| IDOR on conversation/message IDs | Membership check in RLS and RPCs |
| Forged author | `author_user_id = auth.uid()` enforced server-side |
| Revoked member still subscribed | Minimal realtime payload; channel_epoch; re-fetch denied |
| Portal user sees other customers | portal_membership + contact scoping |
| Firm cross-client leak | Evaluate org/engagement per request |
| Accidental external publish | Visibility mode + separate internal notes; no forward of internal-only |
| Chat "approved" posts ledger | Approval RPC requires formal engines; text ignored |
| Stored XSS | Sanitize/render as text; no raw HTML |
| Malicious upload | MIME/size allow-list; private bucket; membership download |
| Notification data leak | Minimal email/push previews; no payroll figures |
| AI prompt injection | Opt-in; permission-filtered context; never autonomous post/pay |
| Rate/spam abuse | RPC rate limits; blocks; moderation events |
| Invitation replay | Hashed tokens, expiry, single use |

## Retention

Configurable per company; legal hold blocks purge; admin exports audited. No compliance certification claimed from controls alone.
