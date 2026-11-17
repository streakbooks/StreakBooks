# Current vs target gap matrix

| Area | Current state (2026-11-17 audit) | Target | Priority |
| ---- | -------------------------------- | ------ | -------- |
| Unified Messages nav | Absent | `/messages` workspace + header panel | P0 |
| Internal DM/groups | Absent | Full realtime DM + groups | P0 |
| Permissions | No `chat.*` / `messaging.*` keys | Granular messaging permissions | P0 |
| Portal customer/vendor messages | `portal_messages` (simple thread) | Same UX via unified conversations + bridge | P0 |
| Advisors qualification chat | Dedicated lead bot tables | Keep separate; engagement → messaging | P1 |
| Advisors portal messages | Separate table | Bridge / dual-path | P1 |
| Employee/HR messaging | HR modules exist; no chat | HR-private + department groups | P1 |
| Transaction Discuss control | Absent | Reusable `RecordDiscussButton` | P0 |
| Approvals from chat | Absent | Call existing approval engines | P1 |
| Action Center messaging items | Accounting detectors only | Unread / assigned / external unanswered | P1 |
| Attachments | company-documents + portal_files | messaging bucket membership-gated | P0 |
| Realtime messaging | Action Center postgres_changes only | Conversation-scoped subscriptions | P0 |
| Feature flag | No messaging flag | `messaging_collaboration` | P0 |
| Settings Centre | Notifications docs exist | Messaging & Collaboration panel | P1 |
| AI messaging assist | AI assistant separate | Opt-in summarize/suggest | P2 |
| Voice/video | None | Provider evaluation only | P2 |
| Analytics | None | Admin volume/response metrics | P2 |
| Retention/legal hold | None | Policies + audit | P1 |
| E2E multi-session chat | None | Required acceptance suite | P0 |
| Cross-tenant RLS tests | Pattern exists for HR | Messaging security SQL + e2e | P0 |

## Reuse (do not duplicate)

- `company_members` / `profiles` for internal identity  
- `portal_memberships` for customer/vendor auth  
- `has_company_permission` / `role_permissions`  
- `action_notifications` publisher pattern  
- `ListWorkspace` / `PageHeader` / AppShell header chrome  
- Existing approval / expense / bill / journal engines  
- Feature catalogue + three-plan entitlements
