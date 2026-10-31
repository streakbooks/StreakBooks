# Notifications & Communications — operational setup and limitations

## What is wired

- Settings → Notifications & Communications uses the typed `organisation_config` record, including optimistic-concurrency saving.
- The saved `email_from_name` and `reply_to` are used by real document emails (invoices, receipts, quotes, statements, PO and reminders) and notification messages. Only the sender **display name** can be changed by a company user; the sending email address always comes from the server.
- Quiet hours are evaluated in the organisation's configured IANA time zone for Action Center email digests. Manually initiated financial document emails remain immediate and critical in-app alerts remain visible.
- The Settings panel displays live Resend provider configuration and live domain verification checks.
- **Send test email** submits a message only to the signed-in user's verified email, at most once per five minutes. This is permitted even in Demo Company; sample financial emails are blocked.
- **Email my Action Center digest now** sends up to 25 currently actionable alerts visible to the authenticated user under Supabase RLS. One attempt per hour; blocked in Demo Company and during quiet hours.
- Actual provider acceptance/failure is recorded in `email_outbox`; settings administrators can inspect results. Provider acceptance is not proof of mailbox delivery.
- Per-user in-app notification category preferences remain in `action_notification_preferences` and are exposed in Settings and Action Center.

## Server deployment configuration

The existing LinkBooks email transport is **Resend**. Required server-only variables:

- `RESEND_API_KEY`: Resend API key, kept in the server environment.
- `EMAIL_FROM`: a domain-verified sender mailbox, e.g. `LinkBooks <billing@your-verified-domain.example>`.
- `APP_BASE_URL`: optional canonical HTTPS application origin for clickable Action Center digest links.

Never put credentials in `VITE_*` client variables, `organisation_config`, the repository, or screenshots. Verify the domain's DNS (including required SPF/DKIM records) using the provider's dashboard. If the API key lacks domain-read permissions, the verification state will show **unknown** instead of claiming verification.

## How to accept the feature

1. Run and apply `supabase/migrations/*_communication_operations.sql` using the recorded migration version.
2. Confirm RLS prevents cross-company preference reads and direct client writes to rate-limit claims.
3. Ensure a non-demo company and a user with company settings + document-management permission are available.
4. Confirm provider configuration in Settings. Click **Send test email** and check the user's mailbox; compare provider id and time in delivery history.
5. Verify the sender name and reply-to on a real authorized invoice email, using a safe internal test recipient.
6. Set quiet hours around the current company-local time; check the digest action refuses sends. Disable quiet hours, then send a digest with at least one real unresolved Action Center alert and verify the recipient only sees records they are authorized to access.
7. Verify mobile layout, timezones (including DST), permission revocation, duplicate send throttles, failed provider responses, and audit history.
8. Run `npm run typecheck`, `npm test`, `npm run build`, `npm run test:voice`, plus end-to-end authenticated browser tests.

## Honesty / remaining infrastructure

- **Scheduled unattended email digests have not been implemented or deployed.** The on-demand digest is operational only when provider credentials are installed. The `communication_digest_preferences` table is a secure foundation, not an enabled automated schedule.
- SMTP/HostGator transport is **not** wired; the existing production transport is Resend. Switching transports needs separate audited implementation and testing.
- SMS and push delivery are not configured. Do not enable or advertise those channels.
- In-app alerts work without the email provider. The Settings Centre category should remain **Partial** until all externally-dependent workflows are verified in a deployed environment.
- Vercel must have the correct team authorization and GitHub author permissions before the production app can deploy the new code.

## Security model

User input cannot override the authenticated test recipient or Resend's verified sender address. Email sending is authenticated and permission-checked on the server; provider keys remain server-only. RLS governs digest source rows and per-user notification preferences. Sender status does not imply successful mailbox delivery.
