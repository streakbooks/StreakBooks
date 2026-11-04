# Approved interface refinement

Base: `linkbusinessadvisory/LinkBooks`, main `6eec8fa5fe20d15b86f839c780f2e21c37aed49c`.
Local branch: `ui/approved-premium-refinement`. No remote publication is authorized.

## Design system

Extend the existing semantic tokens and Radix primitives. Keep eight preset palettes and the
custom palette, independently of light/dark/system preference. Brand accents must not replace
status, money direction, accounting basis, or document lifecycle semantics.

- Use the existing Inter and IBM Plex Mono families, served locally with `font-display: swap`.
- Page headers share typography, a quiet divider, responsive descriptions and wrapping actions.
- Keep one primary action per task region; use context menus for less frequent destinations.
- Shared buttons have visible keyboard focus and at least 44px height on coarse pointers.
- Tables retain native table semantics inside a keyboard-scrollable, contained region.
- Both normal and destructive dialogs stay inside the dynamic viewport and scroll internally.
- Shared form groups retain labels, field validation and helper/error associations.
- Financial figures remain tabular and retain existing formatters and currency precision.

Custom colors preserve the chosen button accent. Text is selected using the actual color's
relative luminance. Links get separate contrast-adjusted ink. Page/card/muted/hover surfaces,
sidebar selection and focus colors are derived without changing accounting semantic tokens.
The regression matrix covers midtones, primaries, black and white in both modes.

## Workflow changes

- Banking has distinct Accounts, Transactions, Reconcile, Cash coding and Transfers destinations.
  Statuses stay in the existing Transactions filter. Secondary banking tools remain native links.
- Sales and Purchases use the same primary/secondary navigation component. All former
  destinations remain accessible with native URLs and modifier-click behavior.
- The shared list toolbar owns search, clearing, export feedback, columns and density.
  Existing client and server filter logic is preserved. CSV exports keep their existing scope.
- Dashboard prioritizes financial position and attention items. Repeated demo explanations and
  header create shortcuts are reduced; demo diagnostics remain available in an expandable panel.
- Batch payments distinguish failed bill/account requests from an empty payable ledger.
  Failed account lookup disables posting. Existing batch keys and posting calls are preserved.
- Bill entry has a supplier drawer below the wide-desktop breakpoint, preserves unsaved form
  state, restores keyboard focus, and does not fetch a hidden desktop summary on small screens.
  Existing saved view preferences and accounting fields are retained.
- Contact CSV upload has a structured read-only preview using the existing RFC 4180 parser.
  The server importer remains responsible for authorization, validation and duplicate handling.
- Portal invoice loading includes only safe checkout mode/live capability metadata from the
  existing server resolver. Unavailable/incomplete checkout shows bank instructions instead of
  an amount form. Sandbox/test states and posting consequences are explicit. Existing payment
  initiation, settlement, authorization and database RPCs are unchanged.
- Bank feeds expose loading, failure, empty and observed connection states. Unavailable settings
  use product language and link to the working asset register where appropriate.
- The report lookup clear button now fits alongside its trigger at small widths. Existing
  report controls and native option semantics are retained.

## Architectural boundaries

No migrations, posting calculations, tax calculations, reporting calculations, permissions,
Supabase auth middleware, RLS policies, database credentials, or external delivery settings
are changed. The sole server response addition is safe portal checkout capability metadata;
it uses the same authorized invoice RPC and does not create a payment intent.

Settings panels are lazy loaded through Suspense without unmounting the originating form.
Path navigation moves focus to the main region; query/filter changes do not steal focus.
Existing asset-recovery handling is retained.

## Verification

Commands and fixture purposes:

| Command                           | Purpose                                                                      |
| --------------------------------- | ---------------------------------------------------------------------------- |
| `npm test`                        | Existing accounting/domain regressions and custom-theme/capability tests     |
| `npm run typecheck`               | Full application TypeScript validation                                       |
| `npm run lint`                    | Repository ESLint/format validation                                          |
| `npm run build`                   | Production client/server build; does not deploy                              |
| `npm run test:ui`                 | Real UI components with deterministic, non-posting browser fixtures          |
| `npm run test:reporting`          | Designer, formulas, filters, lookups, responsive layouts and report settings |
| `npm run test:themes`             | Document themes, logo, persisted settings and multi-page PDFs                |
| `npm run test:navigation`         | Native links, independent tabs and keyboard tab navigation                   |
| `npm run test:corrections`        | Corrections, idempotent retries and permission-sensitive controls            |
| `npm run test:platform`           | Platform access, jobs, approvals and navigation fixtures                     |
| `npm run test:practice`           | Practice review and bulk-conflict behavior                                   |
| `npm run check:navigation`        | Production source navigation contract                                        |
| `npm run check:lookups`           | Production lookup architecture contract                                      |
| `npm run check:repository`        | No tracked environment/runtime artifacts                                     |
| `npm run test:workflows:postgres` | Ephemeral local Postgres accounting workflow tests                           |

UI browser fixtures cover 320/768/1440px, mobile touch targets, all palettes in light/dark,
system preference changes, focus return, contained long dialogs, search/export scope,
columns/density/selection, CSV quoting, failed/empty batch payment loading, portal checkout
availability and bill drawer preservation. Fixture mutations intentionally prevent real posting.

Additional local axe-core checks cover WCAG A/AA tags across the nine palettes in both modes.
These are automated checks of representative shared surfaces, not certification or a replacement
for screen-reader/manual review of every application route.

Existing reporting tests referred to the superseded label "Customize report"; they now target
the existing "Customize statement" label. Source navigation checks follow BankingSubnav's
shared native-link implementation. Mapped presentation enums are explicitly documented as
such for the existing lookup checker. One pre-existing repository-script formatting error is
fixed mechanically so full-repository lint can run cleanly.

Live end-to-end browser → Supabase → ledger checks require a dedicated staging URL and test
session. They cannot be claimed from isolated fixtures. No staging test user was configured at
implementation start. Keep live company/role journeys, real bank/payment-provider callbacks,
manual assistive-technology review and every-route screenshots pending until that access is
available. Do not use production financial records for destructive verification.

## Recorded results — 4 November 2026

- 1,933 unit tests across 259 files passed.
- 118 browser fixture tests passed: UI 35, reporting 23, document themes 5,
  native navigation 5, corrections 8, platform 40 and practice 2.
- Workflow Postgres suite passed: actual shared posting engine, balanced journals,
  period locks, atomic rollback, two-tenant RLS, conversion, lifecycle and concurrency.
- Platform Postgres suite passed: authorization, scoped navigation, approvals,
  operational lifecycle, retries, concurrency and audit retention.
- Automated axe-core checks reported no WCAG A/AA violations on representative shared
  surfaces across all nine palettes in both modes.
- Actual local sign-in page: no JavaScript page errors, no external requests, Inter loaded
  locally, no automated WCAG A/AA violations, and no horizontal overflow at 1440/768/375px.
- Navigation, lookup architecture and repository-hygiene checks passed. Seven pre-existing
  mapped presentation-enum warnings are documented at their actual option lists.

The shared lookup trigger needed `min-width: 0` and flexible sizing to keep its clear
button within the viewport; the existing reporting suite confirmed the fix at 390/768/1440px.
A direct Filters shortcut now opens the existing report filter editor, reducing a click.
The HTML root suppresses only the expected pre-paint theme attribute hydration difference.

Final checks: TypeScript, production build and repository lint passed (lint retains 20 existing
Fast Refresh warnings and no errors). Both npm and Bun lockfiles include the pinned local
font packages; Bun frozen-lockfile validation passed. Implementation is committed locally for integration into main; nothing has been pushed or deployed.

## Local main integration

The completed UI changes were integrated with upstream main `9323f72` after merge approval.
Both the upstream document/accountant PostgreSQL test commands and the new UI test command
are retained. No accounting, document, or firm additions from upstream were removed.

Combined verification: 1,987 unit tests across 271 files, 35 UI browser tests, TypeScript,
production build, changed-file ESLint, native navigation and repository hygiene passed.
The automatic shell merge required one mechanical formatting correction.

Upstream has existing quality issues outside this merge's changed files: 14 lookup-architecture
violations and 14 formatting errors in the document/accountant PostgreSQL runner scripts.
An untouched upstream checkout has 21 lookup violations; this UI change reduces that count
by seven and introduces none. Full-repository lint is therefore not reported as passing on
the newer combined base. These upstream issues are retained rather than silently changing
unrelated workflows during integration.

This integration is local only. GitHub main has not been updated and no deployment occurred.
