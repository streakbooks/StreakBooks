# StreakBooks Chat & Collaboration

Unified messaging platform for internal members, employees, customers, vendors, accountants and advisors.

| Document | Purpose |
| -------- | ------- |
| [PRD.md](./PRD.md) | Product requirements and acceptance criteria |
| [COMPETITOR-COMPARISON.md](./COMPETITOR-COMPARISON.md) | Feature research (reference only; original UI) |
| [GAP-MATRIX.md](./GAP-MATRIX.md) | Current vs target |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Schema, realtime, APIs, RLS, integrations |
| [SECURITY-THREAT-MODEL.md](./SECURITY-THREAT-MODEL.md) | Threats and controls |
| [PHASE-CHECKLIST.md](./PHASE-CHECKLIST.md) | Phase execution gates |
| [PROGRESS-TRACKER.md](./PROGRESS-TRACKER.md) | Verified progress (authoritative for agents) |
| [MODULE-DoD.md](./MODULE-DoD.md) | New-module definition of done for Messages |

## Existing systems (do not replace blindly)

| System | Tables / surfaces | Relationship to unified messaging |
| ------ | ----------------- | --------------------------------- |
| Customer/supplier portal messages | `portal_messages`, `/portal/app/messages` | Bridged as external conversation types; keep portal auth |
| Advisors qualification chat | `advisors_conversations`, `advisors_messages` | Remains lead-intake bot; engagement chat uses messaging |
| Advisors portal messages | `advisors_portal_messages` | Bridged via advisor engagement conversations |
| AI assistant history | `ai_conversation_entries` | Separate AI product surface |
| Action Center | `action_notifications` | Messaging publishes actionable notifications into it |
| Report comments | `report_comments` | Optional future record-link adapter |

## Feature flag

`messaging_collaboration` in Settings Feature Catalogue. Disabled orgs must not expose send/create APIs.

## Naming

Database objects use the `messaging_` prefix to avoid colliding with Advisors and portal tables.
