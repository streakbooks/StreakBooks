# Files workspace — Batch 6: opt-in PDF/image OCR and invoice field extraction

Date: 2026-11-06
Branch: `feature/files-workspace-ux-20261106`
Status: source changes committed; no live provider verification, database integration, unit tests, TypeScript check, lint, build, PR, merge, CI or deployment was performed.

## Scope completed in source

- Added `src/lib/documents/ocr-model.ts`: pure field parser for Azure Document Intelligence v4.0 `prebuilt-invoice` structured results. Suggestions cover supplier/vendor, invoice reference, invoice date, currency, invoice total in verified currency minor units and a tentative supplier-bill classification.
- Added `src/lib/documents/ocr-provider.server.ts`: server-only Azure REST provider, strict HTTPS resource endpoint, no redirect, `base64Source` request, up to three pages, async result check, provider response size cap, and HMAC-SHA256-signed result tokens bound to user/company/attachment with a 45-minute expiry.
- Added `src/lib/documents/ocr.functions.ts`: authenticated start and check endpoints. Each operation checks existing company document **manage** permission, authenticated Supabase Storage access, company-level attachment identity, the review queue, file type and the 8 MB OCR limit. The provider API key and raw OCR text do not reach the browser.
- Added `src/components/documents/DocumentOcrPanel.tsx`: explicit opt-in checkbox, manual Start extraction / Check OCR result, suggestions and confidence values, restart option, no silent automation.
- Integrated the panel in `src/components/documents/DocumentReviewQueue.tsx` for `needs_review` or `ready` documents only. The **Fill blank review fields** action leaves existing fields, review status and notes unchanged. The user must still inspect and explicitly **Save review**; existing optimistic version checks and approval permissions remain in force.
- Added `ocr-model.test.ts` and `ocr-provider.test.ts` covering provider request/response handling, token signature/expiry/scope, no raw content response, supported types, invalid dates, currency exponents, field confidence and no overwrite of manual entries.

## External setup, separate from Resend/HostGator

Set these environment variables on the **application server** only:

```text
AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT=https://<azure-resource>.cognitiveservices.azure.com
AZURE_DOCUMENT_INTELLIGENCE_KEY=<secret-from-azure>
DOCUMENT_OCR_JOB_SIGNING_KEY=<long-random-secret-at-least-32-characters>
```

- Provision a Document Intelligence resource with the `prebuilt-invoice` model and applicable Azure data-processing/privacy terms.
- API version: `2024-11-30`.
- OCR supports PDF, JPEG and PNG (matching content type and file extension), at most **8 MB** per file and **pages 1–3**. Azure free-tier size restrictions can be lower; production tier and geography must be evaluated.
- External provider processing takes place **only after the reviewer checks consent and selects Start extraction**. No inbox auto-OCR, scheduled job or continuous background processing is included. There are no new SQL migrations in this batch.
- Avoid setting any API key in Vite/VITE_ client variables, the database, committed files or browser config.

## Security and integrity boundaries

1. The file is retrieved from the private `company-documents` bucket with the user's scoped Supabase client, not from an arbitrary signed URL or a service-role bypass.
2. Only authenticated users with existing company-file management permissions can initiate or fetch results. The attachment must be a company document in the manual review queue with status `needs_review` or `ready`.
3. Results are checked via the configured resource endpoint only. The provider's Operation-Location URL is parsed and validated; it is never fetched directly. Request IDs are validated UUIDs.
4. A signed result token binds user ID, company ID, attachment ID, result UUID and issue timestamp. Tokens expire after 45 minutes, after which extraction must be restarted. No provider job is stored in the database or shared with other users.
5. The Azure result is converted server-side into a bounded subset of review suggestions. Raw OCR text, line items, provider credentials and original document bytes are **not** exposed to the page as the extraction response.
6. Totals use an explicit set of ISO minor-unit conversions; unsupported currencies or unrepresentable fractional minor units are left blank with a warning. Dates must be genuine YYYY-MM-DD calendar dates.
7. The suggestion application never changes review lifecycle status, overwrites a nonblank value or creates accounting postings. It is not equivalent to financial authorisation, VAT extraction, tax compliance or AI-supported bill creation.

## Deliberate limitations

- The feature is currently **invoice-focused**. It does not claim accurate receipt, statement, contract or bank-statement extraction; additional specialized models are separate work.
- The adapter is wired to the Azure provider based on published REST documentation. **No live Azure account has been connected, billed, tested or configured**. The service is unavailable until the administrator sets the environment variables.
- There is no persistent OCR job status across refreshes, result caching, asynchronous worker, cancellation at the provider or automatic retry/rate-limit management.
- Azure could return an invoice model response without complete structured fields; the user remains responsible for completing the document review manually.
- The OCR provider may process confidential business information. Obtain appropriate organizational consent, evaluate the service region and privacy terms, and configure tenant-level policies before activation.
- The feature branch remains separate and substantially diverged from active `main`. Do not merge on static inspections alone.

## Required local verification — GitHub CI intentionally prohibited

```powershell
cd D:\MyApp\LinkBooks
git fetch origin
git worktree list
# Only create the directory if it does NOT already exist:
git worktree add --detach D:\MyApp\LinkBooks-Files-B6 origin/feature/files-workspace-ux-20261106
cd D:\MyApp\LinkBooks-Files-B6
npm.cmd ci
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test -- src/lib/documents/ocr-model.test.ts src/lib/documents/ocr-provider.test.ts src/lib/documents/review-model.test.ts
npm.cmd run build
npx.cmd vite dev --port 8081 --strictPort
```

If the named worktree already exists, inspect and preserve uncommitted changes instead of recreating it.

## Manual acceptance after configuration

1. With provider not configured, verify disabled OCR and no third-party transmission.
2. Select PDF, PNG, JPEG, unsupported formats, mismatched MIME/extensions, and above/below 8 MB to confirm allowed types and bounds.
3. Provide written consent and submit a representative scanned supplier invoice. Poll pending, success and failure outcomes; confirm reference, date, vendor, currency and minor-unit total, including INR, USD, JPY and KWD.
4. Confirm existing manually typed values, notes, review status, version and zero amounts remain unchanged by Fill blank review fields; save remains a deliberate manual action.
5. Verify ready/approved/rejected/archived restrictions; two-company RLS; cross-user token replay, token tampering, expiry and user permission revocation mid-extraction.
6. Check malformed API JSON, provider redirects/403/429, oversized responses, malformed calendar dates, unknown currency exponents, network failures, mobile and keyboard UX.
7. Review provider regional settings, privacy policy and real per-page charges; ensure audit events contain IDs and model metadata only, not OCR raw content.
8. Integrate the latest concurrent `main` changes, run full local tests and authenticated staging QA before PR/merge/deployment.

Reference docs: https://learn.microsoft.com/en-us/rest/api/aiservices/document-models/analyze-document?view=rest-aiservices-v4.0 and https://learn.microsoft.com/en-us/rest/api/aiservices/document-models/get-analyze-result?view=rest-aiservices-v4.0

**CI status:** no GitHub Actions workflows were manually triggered or run.
