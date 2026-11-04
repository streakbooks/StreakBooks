# Approved interface refinement

Base: `linkbusinessadvisory/LinkBooks`, main `6eec8fa5fe20d15b86f839c780f2e21c37aed49c`.
Initial branch: `ui/approved-premium-refinement`. Completion branch: `ui/complete-premium-interface`.
The user subsequently authorized publication and merge into GitHub main. Deployment remains separate.

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

## Initial implementation results — 4 November 2026

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
font packages; Bun frozen-lockfile validation passed. At this checkpoint implementation was committed locally; publishing and deployment had not occurred.

## Earlier local main integration

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
the newer combined base. These issues were recorded at that checkpoint and addressed during the subsequent completion pass.

That checkpoint was local only. The completion pass below supersedes its quality limitations; no deployment is part of this change.

## Completion pass

Latest upstream firm invitations, recurring billing and accountant workpaper changes are retained.
Searchable authorized-record lookups now cover firm colleagues, engagements, invoices, documents
and recurring templates. All 16 remaining lookup architecture violations on the combined base
are resolved; fixed status/type/frequency enums remain ordinary selects with explicit annotations.

Required-data failures have recovery UI on banking, product accounting options, receipts,
recurring sales, statements, credit notes, expenses and payments. Retry controls are also added
to existing document, practice, contacts, orders and settings errors. Required-data guards only
replace a form when no cached result exists, preserving unsaved inputs during background
refetch failures. The query error component retries failed queries without reloading successful
ones. Accounting mutations, tenant scopes, permission checks and SQL are unchanged.

Sheets and popovers contain overflow on small screens. Intent-based route preloading improves
navigation latency. The firm colleague lookup has keyboard/search and view-only browser tests.

`PAGE-COVERAGE.md` inventories every production route definition, action declaration and query
count. `check:ui` scans all production TSX for literal placeholder destinations, empty click
handlers and unnamed direct icon actions. This static check cannot prove arbitrary handlers,
provider callbacks or live server behavior. `check:lookups` and browser regression suites are
now mandatory GitHub CI gates. PostgreSQL runner formatting is corrected so full lint runs.

The user's permanent final reporting requirements are persisted in `AGENTS.md` and
`docs/engineering/FINAL-REPORT-STANDARD.md`. Authenticated staging remains conditional on
repository staging configuration and dedicated test credentials; fixtures do not replace it.

### Completion verification before subsequent upstream integration

- 1,998 unit tests passed across 274 files; zero failures.
- 121 browser fixture tests passed: UI 38, reporting 23, themes 5, navigation 5,
  corrections 8, practice 2, platform 40; zero failures.
- Six isolated PostgreSQL suites passed: workflows, documents, accountant exceptions,
  accountant workpaper items, platform permissions/lifecycle, cash history/delivery.
- TypeScript and production build passed. Full ESLint: zero errors, 20 existing
  Fast Refresh warnings. Build retains existing server-function deprecation warnings.
- Source contracts: 384 TSX files, 130 route definitions, zero UI contract violations;
  150 shared lookup declarations, zero lookup violations. Navigation and repository
  hygiene checks passed.

These are local results for the completion changes, not live staging or production acceptance.
GitHub merge status and CI URLs must be verified at publication and reported separately.
No SQL migration or deployment is required or executed by this UI change. Existing upstream
migration application is outside this verification. Authenticated staging credentials remain
unavailable; real company journeys, provider callbacks, every-route manual accessibility and
production performance still require dedicated staging/manual review.

### Subsequent upstream integration

Main advanced to `8d78541` while PR #52 was awaiting merge. The integration retains the new
contact segmentation, task ownership/reminders, CRM timeline and atomic currency settings.
Contact import keeps the newer column mapping and cache invalidation, with accessible file
selection and truthful partial-failure feedback. A duplicate raw preview is omitted in favor
of the newer mapped preview. Three browser regressions exercise the actual import page with
browser-local responses: quoted mapping/partial results, empty replacement files and view-only
permissions. No remote contact writes occur in these tests.

New contact group/tag/view and assignee selectors use the shared searchable lookup. Activity,
settings and currency enums and the uploaded CSV column schema remain explicit enumerations.
The refreshed source inventory covers 387 TSX files and 130 route definitions; lookup contracts
cover 157 shared declarations with zero violations. The new merged revision must pass fresh
GitHub CI before merge; earlier counts above belong to the prior revision.
