# LinkBooks Files — Batch 5: Company email-to-inbox receiving

Date: 2026-11-06
Status: committed source implementation. **Not deployed or production verified.**
Feature branch: `feature/files-workspace-ux-20261106`.

## Delivered source components

- Migration: `supabase/migrations/20261106140000_files_email_inbox.sql` adds an opt-in company-scoped, immutable receiving alias with RLS. It also adds provider message/attachment provenance and a company-wide unique key to `document_attachments`.
- Server-only Resend Receiving client: `src/lib/documents/email-inbox-provider.server.ts` lists received messages and attachments, verifies intended recipient equality, and strictly bounds remote downloads. Provider secrets never enter the browser.
- Authenticated server methods: `src/lib/documents/email-inbox.functions.ts` create/activate/pause an inbox, list messages, list attachments and import selected attachments. The company ID is required on every method; RLS and the existing `company` entity manage permission apply to imports.
- Files screen: a new **Email inbox** tab displays configuration status, a copyable private address, activation controls, incoming messages, attachment import buttons and provider error states via `DocumentEmailInbox`.
- Imported files use the existing private `company-documents` bucket and company-level `document_attachments`. The existing document-review trigger then enqueues them for manual review. **No invoice, bill, journal, tax return or payment is created or posted automatically.**
- Duplicate imports of the same provider email ID plus attachment ID are guarded by a unique database index; the server returns an already-imported result. Independent provider messages with equal file contents are not deduplicated here.

## Deployment configuration

These are **server environment variables**, not UI user inputs:

```text
RESEND_INBOUND_API_KEY=<server-secret>
RESEND_RECEIVING_DOMAIN=<verified-incoming-resend-domain>
```

They are **separate** from existing outbound `RESEND_API_KEY` and `EMAIL_FROM`; the latter remain untouched. Neither secret is committed in Git.

**HostGator coexistence:** Keep the existing HostGator MX records and mailbox. Forward approved supplier-invoice or receipt emails from the existing account to the organisation-specific receiving address shown in Files → Email inbox. Alternatively use a distinct receiving subdomain configured at Resend. Do not point the existing primary MX records to Resend merely to enable this feature.

Provider status, credentials, available domain aliases, and forwarding configuration must be confirmed directly with the administrator; no live mailbox or provider is connected in this code batch.

## Activation sequence

1. Run **the new versioned migration** against a staging DB after backup and review.
2. Verify `company-documents` private bucket and the existing document-review migration and triggers.
3. Configure server-side Resend Receiving credentials and an actual receiving domain.
4. Under Files → Email inbox, create a receiving address as a member with document-management permission, then activate it.
5. Configure a HostGator forwarding rule or use the receiving address directly; send a small controlled PDF to that address.
6. Click Check inbox; select the received message, preview attachment metadata and import. Confirm it appears once under Document review.
7. Refresh and reimport the same file: it must return Already imported without duplicate Storage objects.
8. Pause the inbox and verify it no longer permits listing/importing until reactivated.

## Security and limitations

- This initial working path is **user-initiated/on-demand**: Resend Receiving API is checked when the user opens the inbox or presses Check inbox. No webhook, queue worker, cron polling or unattended automatic receipt is implemented.
- Provider pages are scanned in chunks of 50, with older-page navigation. An email addressed to a different company's alias MUST NOT be returned or importable. Browse permissions are company membership; importing requires company-document manage permission.
- The only email data shown is a recipient-authorized subject, sender, time and attachment metadata. Email bodies and provider-signed attachment URLs are not sent to the browser.
- Attachments are validated by the existing Files type and 20 MB size policy, fetched over HTTPS from a restricted host set with redirects disabled and streaming size bounds, and stored using the user-scoped Supabase client with private Storage RLS.
- As with other file uploads, Storage upload followed by metadata insertion is not a single database transaction. Metadata failure triggers cleanup, but a process interruption can leave an orphaned Storage object pending separate recovery work.
- The content type is provider-reported; this is not malware scanning, signed MIME sniffing or OCR. A secure content-scanning pipeline is required before supporting arbitrary/integrations beyond the existing file allowlist.
- This batch assumes Resend's published Receiving endpoints and attachment URLs are available to the configured account. Attachment downloads from an unexpected hostname are rejected rather than weakening the URL allowlist without verification.
- Audit, availability, idempotency under concurrency, and RLS need staged integration tests. No LIVE secrets were accessed and no inbox was activated.
- The Files feature branch is still diverged from a rapidly advancing `main`, so reconcile and test before PR/merge.

## Focused tests authored (NOT executed)

`src/lib/documents/email-inbox-provider.test.ts`: absent configuration, immutable address form, case-insensitive exact recipients, provider auth header, redacted response payload, untrusted URL/redirect rejection, and streamed 20 MB-equivalent limits.

## Required verification

```powershell
cd D:\MyApp\LinkBooks
git fetch origin
git worktree list
# Create a new destination only if it does not already exist:
git worktree add --detach D:\MyApp\LinkBooks-Files-B5 origin/feature/files-workspace-ux-20261106
cd D:\MyApp\LinkBooks-Files-B5
npm.cmd ci
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test -- src/lib/documents/email-inbox-provider.test.ts src/lib/documents/file-workspace.test.ts src/lib/documents/file-batch.test.ts
npm.cmd run build
npx.cmd vite dev --port 8081 --strictPort
```

Manual scenarios: no credentials; missing migration; disabled inbox; unauthorized user; 2 companies sharing one provider account; inbound forwarded email; 0/1/100+ attachments; duplicate provider IDs and concurrent imports; unsupported/oversize files; body privacy; SSRF redirect attempts; exact destination address; provider 429/network failure; user switches company while requests run; and browser/mobile keyboard access.

GitHub CI and Actions were intentionally not manually started. PR, `main` merge and deployment were not performed.
