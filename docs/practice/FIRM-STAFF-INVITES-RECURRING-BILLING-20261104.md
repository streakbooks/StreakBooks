# LinkBooks Firm & Clients: remaining delivery controls

**Scope:** staff invitations and recurring practice billing added without replacing Supabase Auth, company membership, existing Sales document posting, or Resend.

## Staff invitation workflow

1. Firm owner/admin opens **Firm & Clients → Staff invitations** and provides a verified recipient email. Only owners may invite another administrator. No owner role can be issued by invitation.
2. LinkBooks stores only the SHA-256 hash of a cryptographically random 32-byte bearer token in a private-schema table. Pending tokens expire after 7 days; re-inviting invalidates the prior pending token.
3. Delivery uses the existing server-side Resend transport **only** if `APP_BASE_URL` is a valid HTTPS origin (or localhost for development), `RESEND_API_KEY`/`EMAIL_FROM` are configured, and the sender domain verifies. Otherwise the creating administrator can securely copy the one-time link. Do not represent provider API acceptance as confirmed inbox delivery.
4. Recipient signs in or registers, verifies the exact invited email and accepts once. Acceptance adds firm membership only, never automatic client-company access or a managed grant. A firm administrator must arrange company access separately under existing controls.
5. Invite list shows expiration, status and provider-acceptance status. Revoke invalidates a pending link without removing memberships from already accepted invites.

**Security checks:** mismatched account, expired/revoked/replayed tokens, member-created administrator invitations, MFA, rate limits and tenant separation. Run `supabase/tests/firm_staff_invitations.sql` on the migrated project; it must end with rollback.

## Recurring practice billing

1. Firm owner/admin creates an **active engagement** under a client. The fee and currency are practice references, not tax-inclusive financial postings.
2. Switch to a **separate practice billing company** and create a matching **Sales → Recurring** invoice template using the existing sales document workflow. Select the customer/contact, revenue account, tax code, lines, currency, payment terms, and monthly/quarterly/annual frequency.
3. In **Firm & Clients → Practice billing**, select the engagement and an eligible active, draft-only recurring template. Link it to the engagement. One recurring template may belong to one engagement; the link cannot reparent a client or billing company.
4. On the due date the firm administrator can explicitly **Generate due draft**. This delegates to LinkBooks' original idempotent sales recurring generator, then links the resulting practice invoice reference back to the engagement. A failure to link the reference reports that the invoice already exists and must not be blindly retried.
5. Automatic posting/authorisation is deliberately **not enabled** through this firm workflow. Existing recurring scheduler settings and deployment cron determine whether scheduled generation runs without a manual click. Confirm the scheduled worker independently before claiming automation is enabled.

## Manual QA in local application

- [ ] Clean local main with `git status`, then `git pull --ff-only origin main`, `npm ci` and `npm run dev`.
- [ ] Verify normal, admin and owner firm roles across two client companies.
- [ ] Owner invites member and admin, checks expiry and rejects duplicate recipient.
- [ ] Admin cannot invite an admin; team member cannot issue invitations.
- [ ] Invited person signs in with verified email, accepts once, and sees the firm **without automatically seeing client books**.
- [ ] Wrong email, expired and revoked links cannot join a firm.
- [ ] Configure verified Resend sender and `APP_BASE_URL`, then test with a controlled mailbox and provider delivery logs (requires credentials).
- [ ] Select a distinct practice billing company; client company cannot be selected as billing company.
- [ ] Create a matching draft-only recurring Sales invoice, link it to an active engagement, and review schedule details.
- [ ] Future-dated, mismatched, cancelled, paused and auto-authorised schedules cannot be generated from the practice workflow.
- [ ] Generate a due draft, inspect line totals/tax/numbering in Sales, and verify that an invoice reference is linked. A second attempt must not duplicate the occurrence.
- [ ] Verify unauthorised staff and separate firms cannot inspect or change these records.
- [ ] Run authenticated staging browser smoke and confirm Vercel production deployment for the merged main SHA.

## Deployment prerequisites and honest limits

- Environment: `APP_BASE_URL`, `RESEND_API_KEY`, `EMAIL_FROM`, verified Resend sender domain and permitted authentication redirect URLs.
- Database: apply both firm invitation and firm recurring-link migrations using Supabase migration history **before** enabling the interface.
- Production: GitHub CI, database RLS isolation and verified browser tests are separate checks.
- No client documents, financial ledger, customer emails or member grants are changed simply by opening or linking an invite or recurring template.
