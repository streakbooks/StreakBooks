# Messaging migration inventory

Ordered apply list for staging/production (additive only).

| File | Purpose |
| ---- | ------- |
| `20261117120000_messaging_collaboration_foundation.sql` | Core tables, RLS, DM/group/send/read |
| `20261117121000_messaging_portal_bridge_and_lifecycle.sql` | Portal bridge + member revoke |
| `20261117130000_messaging_attachments_portal_actions.sql` | Attachments, portal discuss, HR/accountant, approvals |
| `20261117140000_messaging_advisor_engagement.sql` | Advisor chat, pin/star |
| `20261117150000_messaging_prefs_unread_mentions.sql` | Prefs, mark unread, mentions listing |
| `20261117160000_messaging_collaboration_flags.sql` | Org collaboration flags |
| `20261117170000_messaging_members_digest_claims.sql` | Add members + digest claim kind |
| `20261117180000_messaging_block_retention_rate.sql` | Block/unblock, retention, send rate limit |
| `20261117190000_messaging_report_message.sql` | Message reporting |
| `20261117200000_messaging_rename_remove_member.sql` | Rename + remove member |
| `20261117210000_messaging_create_channel.sql` | Internal channels |
| `20261117220000_messaging_realtime_and_external_lock.sql` | Outbox realtime publication + force-close external flags |

Apply with `db query --remote --yes -f` + `migration repair` (never blind `db push`). See `MESSAGING-FINAL-SUPABASE-CI-COMMANDS.md`.
