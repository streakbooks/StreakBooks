# Invoice Theme & Branding delivery

Date: 1 November 2026. Scope follows the user's latest branding-only request. Accounting calculations, posting/reversal services, banking, tax configuration, approval rules and sales transaction processing were not changed. Shared document presentation and issue-time appearance capture are included because they are required to apply and preserve designs.

## Findings and resolution

| Module                | Existing functionality / defect                                                             | Improvement                                                                                                                                                              | Status and evidence                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Organisation branding | Single organisation-wide design; organisation switches could retain the previous form state | Key the workspace by organisation; retain the existing branding fallback                                                                                                 | Implemented; type/build and regression checks passed                                                     |
| Branding persistence  | Separate branding/company updates and unchecked audit response could partially save         | One permission-checked transactional RPC, including audit                                                                                                                | Verified Complete at database boundary                                                                   |
| Theme management      | No reusable designs or document defaults                                                    | Create, edit/rename, duplicate, delete unused themes with confirmation, optimistic revision checks and per-document defaults                                             | Verified Complete in DB and isolated real-editor browser tests                                           |
| Design controls       | Accent, contact text and logo only                                                          | Typography, colours, logo dimensions/position, A4/Letter, orientation, margins, header/title/footer alignment, table styles, relative column widths and field visibility | Implemented and tested with actual renderer and PDFs                                                     |
| Logo history          | Replacing a logo deleted its predecessor                                                    | Keep referenced objects; restrictive storage update/delete policies protect issued/current/theme logos                                                                   | Database policy/retention tests passed; Storage API/browser integration requires credentialed acceptance |
| Issued documents      | Print/share views read current company/contact branding                                     | Capture immutable organisation/contact appearance and selected theme revision when the source leaves draft; use it in print and shared invoice views                     | Verified Complete in real authenticated database tests and source loader implementation                  |
| Historical documents  | Past designs were never recorded                                                            | Explicit `legacy_baseline` at rollout; preserve legacy layout defaults and display provenance in print controls                                                          | Implemented; historical designs from before rollout cannot be recovered                                  |
| Customer statements   | Separate print layout could diverge from theme preview                                      | Shared statement presentation component, with the existing statement model and totals unchanged                                                                          | Browser-tested preview; full regression passed                                                           |
| PDF display           | Tax showed `20%%`; payment-term label appeared twice                                        | Correct the display labels only                                                                                                                                          | Unit/browser checks and extracted real PDF text passed                                                   |
| Hosted acceptance     | Vercel team access unavailable in this connection; no test-login/browser session configured | Record separately from local/DB verification                                                                                                                             | Blocked for hosted acceptance; no production deployment success claimed                                  |

## Features

Open **Settings → document branding** (`/documents/branding`) to use the **Theme studio**. The existing organisation details are retained in the expandable fallback panel.

- Multiple named themes, revisions, duplicate, rename, save, cancel and confirmed deletion. Used themes cannot be deleted, including after their defaults change, because historical copies retain their references.
- Independent defaults for invoices (including drafts), quotes, credit notes, customer statements, purchase orders, receipts and remittance advice. Existing purchase bills and supplier credits are also supported.
- Theme-specific uploaded logo, removal or organisation-logo inheritance; PNG/JPEG/WebP/GIF up to 2 MB. Signed URLs are resolved at read time, rather than stored as expiring configuration.
- Company display name, registration/letterhead text, address, tax registration label, contact details, payment/bank instructions, notes/terms and footer overrides. Unchanged text fields inherit organisation branding.
- Three locally available font families, body/heading sizes and weights, line spacing, primary/accent, secondary, heading, table-header, body-text and page-background colours.
- A4 and US Letter; portrait/landscape; 8–25 mm margins; logo width/height and placement; split/stacked header; title/footer alignment; lined/striped/minimal tables; cell spacing and relative widths for every line-table column. Hidden columns release their space to visible columns.
- Visibility for number, issue/due dates, customer information, billing/contact details, description, quantity, unit price, discounts, tax column/summary, subtotal, grand total, notes, payment instructions and bank details. Visibility affects presentation only; figures and records are unchanged.
- Live desktop design preview, long/multi-page sample, and an isolated print/PDF preview using the same document sheet. Statement previews use the same statement sheet as live statements. Sample links are not interactive.
- Drafts resolve the current default. Issued documents keep their saved design/contact appearance. Payment balances and status remain live; this is appearance preservation, not a second financial ledger.

## PDF verification

The implementation deliberately preserves the existing browser-based **Print / Save as PDF** architecture. It does not pretend to provide a server-generated attachment or a one-click PDF download. The isolated print frame waits for stylesheets, fonts and images and reports image/style failures.

Actual Chromium-generated files were inspected locally:

| Sample                           | Verified output                                                                                          |
| -------------------------------- | -------------------------------------------------------------------------------------------------------- |
| A4 portrait                      | One page; 594.96 × 841.92 points                                                                         |
| US Letter landscape, long sample | 18 pages; 792 × 612 points; embedded logo image present                                                  |
| Extracted text                   | Final item 65 and the exact sample total £7,788.00 present; no doubled percentage or payment-term labels |

These artifacts live under ignored `work/` and are test samples, not real customer invoices. Browser paper/scale/header/footer settings can override native print output; use the saved paper size and normal scaling. Cross-browser/OS and extremely long unbroken content require further visual acceptance.

## Database and security

Applied to the existing connected Linkbooks Supabase project, with local filenames matched to migration history:

- `20261101124107_document_themes_and_issued_appearance.sql`
- `20261101124516_document_theme_layout_controls.sql`
- `20261101124922_document_theme_platform_guards.sql`
- `20261101125137_document_theme_column_widths.sql`

New tables: `document_themes`, `document_theme_defaults`, `issued_document_appearances`. Composite company/theme foreign keys prevent cross-organisation defaults. Company-scoped indexes support lookup, revision and logo retention. Direct client writes are revoked; source-permission-checked appearance RPCs control snapshot reads. Snapshot tables are not exposed through broad authenticated SELECT.

Theme/default writes use the existing platform tenant/maintenance/subscription guard. Public write APIs require live settings permission and the existing MFA requirement. Private helpers and exposed RPCs have fixed search paths; anonymous mutation is revoked. Configuration uses strict field/enum/colour/range validation rather than executable CSS/HTML. Audit writes are part of the transaction. Source/financial document tables receive appearance-capture triggers only; no accounting amounts or journal fields are changed by these triggers.

The token-protected public invoice endpoint retains the existing token validation/revocation checks and customer-data privacy boundary while using the stored appearance. It does not expose internal identifiers or private contact email/phone through the snapshot payload.

The security advisor flags six intentionally authenticated SECURITY DEFINER RPCs. Their company permissions, MFA, input validation and execution grants were reviewed and tested. This documents those warnings; it does not claim an advisor-free project.

Rollout adds appearance metadata for existing issued documents without altering their financial rows. All test users, companies, logos (metadata only), themes, journals and documents were synthetic and rolled back. Existing issued documents' old designs cannot be reconstructed retrospectively; rollout baselines are identified honestly.

## Tests performed

- Full Vitest regression: **157 files / 1,195 tests passed**. After the final sample-discount refinement, all seven document test files / 60 tests passed again.
- **Five Chromium theme tests passed**: CRUD, logo preview/persistence, saved settings/default, duplicate/delete, read-only controls, statement preview, isolated print action and actual A4/Letter PDFs with correct geometry and embedded image.
- `supabase/tests/document_themes.sql`: real shared posting engine followed by source issue transition; snapshot/default selection; theme edit/concurrency; company/contact independence; unchanged financial total/line count; unused/used deletion rules; config rejection; tenant isolation; MFA; public token view/privacy; logo retention protections. Passed with rollback.
- Existing accounting/correction suites were run as database regression after appearance triggers were installed.
- TypeScript, changed-file ESLint and production build passed. ESLint has one isolated-fixture fast-refresh warning; existing TanStack validator deprecation warnings remain.
- Browser adapters are intentionally isolated, with real editor/renderer and fixture persistence/upload adapters. The real database suite tests the authoritative data/security boundary separately. This is not a claim of a credentialed browser → live Storage/API → database → final invoice acceptance run.

Commands:

```text
npm run typecheck
npm test
npm run test:themes
npm run build
```

The theme browser suite is included in GitHub verification.

## Files modified

- Studio: `DocumentThemeEditor.tsx`, `DocumentThemes.tsx`, and `documents.branding.tsx`.
- Rendering: `DocumentSheet.tsx`, `CustomerStatementSheet.tsx`, shared branding/document types and mappers, the document loader, print page and statement presentation page.
- Services: `documents.functions.ts` and `src/lib/documents/themes/` (validated contracts, theme APIs, preview data, print isolation, presentation and tests).
- Database: the four migrations above and `supabase/tests/document_themes.sql`.
- Verification: `e2e/themes/`, `playwright.themes.config.ts`, default Playwright exclusion, package script and GitHub verification step.

## Remaining limitations

- Current source documents have no shipping-address data. No ineffective shipping control is displayed and no address is invented. Adding that data belongs to a separately authorised source-document change.
- Statements are regenerated reports using the current statement default. They are not stored issued-document snapshots.
- Bank/receipt/remittance status and payment data remain authoritative live source data. The design settings do not change those records.
- External legacy logo URLs cannot guarantee immutable remote image bytes. New theme uploads use retained private storage objects.
- Printing uses browser Save as PDF, not a server PDF service, custom font uploads, arbitrary HTML/DOCX templates or recurring per-page header/footer engine.
- Authenticated whole-application, actual Storage API round trips, cross-browser print acceptance and production deployment remain to be verified with the appropriate test session/team access.
