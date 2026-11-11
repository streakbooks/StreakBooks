# LinkBooks — Complete All-Module Premium Browsing Coverage

**This is the master coverage scope, not an assertion of implementation completion.**  
**Authoritative repository:** `linkbusinessadvisory/LinkBooks`  
**ChatGPT-only development branch:** `feature/chatgpt-premium-browsing-20261107`  
**Source audited:** `src/lib/nav.ts` and the authenticated route tree at `8935c7bd180d94d8539f75460f8542dffd648b5b`.

## Policy: no module, route, screen or functional workflow may be omitted

The website-like browsing initiative applies to **every** existing and future LinkBooks sidebar module, submenu, internal tab, list, detail, drawer, modal, form, workflow, report, permission-sensitive action, connected record and support page. All 12 agreed premium-browsing requirements apply to each area, not only Sales/Purchases/Contacts/Products.

The register below was derived from actual repository navigation and routes. These route file counts are **not** a percentage of feature completion: individual route files may contain many tabs and workflows, and some internal workspaces have no separate route. A module with a single route can still require extensive development.

**Inventory at source revision:** 21 sidebar entries, 132 authenticated route files (117 associated with sidebar modules and 15 supporting route files). **No fully verified module is yet established in this browsing project.**


### Advisors Administration appointments browsing increment (2026-11-09)

- `src/screens/advisors/admin-appointments.tsx`: retains Advisors subnavigation on loading/error, announces loading/errors and appointment counts, validates unavailable-period end after start, prevents overlapping booking/status mutations and redundant status updates. Source commit `6b19df8929eb66055f9b0f41ce87674f29c932d3`.
- **Partial source evidence only.** `check:browsing-coverage`, TypeScript, lint, build, unit, authenticated browser, accessibility, booking permissions/RLS and accounting regressions **NOT RUN**. 0/21 modules, 0/15 supporting routes, 0/12 batches verified. No main merge, CI trigger, database change or deployment.


### Advisors Administration clients browsing increment (2026-11-10)

- `src/screens/advisors/admin-clients.tsx`: persistent Advisors subnavigation during loading and client/staff errors, retry both queries, accessible result count, native client form submission and guards against overlapping client save/invite/unlink actions. Source commit `36ed571b1bd8c41ea9798df9acf192be5b72e33b`.
- **Partial source evidence only.** Client editing refresh behavior, invite/unlink permissions and all 12 acceptance criteria still require verification. Local `check:browsing-coverage`, TypeScript, lint, build, unit, authenticated browser, accessibility, RLS and accounting regressions **NOT RUN**. **0/21 modules, 0/15 supporting routes, 0/12 batches verified**. No `main` changes, CI trigger, production database change or deployment.


### Advisors Administration engagements browsing increment (2026-11-10)

- `src/screens/advisors/admin-engagements.tsx`: preserves Advisors subnavigation on loading/errors, retries all three list dependencies (engagements, clients, staff), announces result count, guards negative/unsafe integer amounts and conflicting create/send button actions, and treats clipboard-copy failure as nonfatal after successful proposal sending. Source commit `538e1a11ad1dac23f977a902f8dde2a9a9f3cb4f`.
- **Partial source evidence only.** Full engagement lifecycle, draft retention, native navigation, authenticated role/RLS and accounting integrity, accessibility, performance and all 12 acceptance criteria remain pending. `check:browsing-coverage`, TypeScript, lint, unit, build, authenticated browser and security regressions **NOT RUN**. **0/21 modules, 0/15 supporting routes, 0/12 batches fully verified**. No main merge, CI trigger, production database change or deployment.

### Advisors Administration billing browsing increment (2026-11-10)

- `src/screens/advisors/admin-billing.tsx`: retains Advisors subnavigation in loading/error states, announces loading/errors and list counts, resets company input on engagement selection, passes an explicit company ID into link mutation to avoid stale state, and disables conflicting billing actions while any mutation is pending. Source commit `9efa94330c66e826e9ae34292b992bbbf56d7498`.
- **Partial source evidence only.** Local `check:browsing-coverage`, TypeScript, lint, build, unit, authenticated browser, accessibility, billing permissions/RLS and accounting regressions **NOT RUN**. **0/21 modules, 0/15 supporting routes and 0/12 batches fully verified.** No `main` merge, manual CI trigger, production database change or deployment.


### Advisors Administration documents browsing increment (2026-11-10)

- `src/screens/advisors/admin-documents.tsx`: preserves Advisors subnavigation during loading and errors, adds accessible loading/error/results announcements, and bounds change-reason input to 5,000 characters. Source commit `5c33632c523413913a54f9eeed61d9eed0237d48`.
- **Partial source evidence only.** Document request lifecycle, native navigation, role/RLS, accessibility, and all 12 acceptance criteria remain pending. Local `check:browsing-coverage`, TypeScript, lint, unit, build, authenticated browser, security and accounting regression tests **NOT RUN**. **0/21 modules, 0/15 supporting routes, 0/12 batches fully verified.** No main merge, CI trigger, database change or deployment.


### Advisors Administration workspaces browsing increment (2026-11-10)

- `src/screens/advisors/admin-workspaces.tsx`: keeps Advisors subnavigation during loading/error, retries both list and candidate queries, announces workspace count, bounds reason and note inputs to 5,000 characters, prevents conflicting button mutations and redundant task status actions, and exposes selected workspace/period state to assistive technology. Source commit `cd4d752dcf3c0b9e061c11a5fe3411a9a1dbcedd`.
- **Partial source evidence only.** Workspaces lifecycle, selection refresh/back-forward, role/RLS, accessibility, accounting integrity and all 12 criteria remain unverified. Local `check:browsing-coverage`, typecheck, lint, build, unit, authenticated browser, security and accounting regression tests **NOT RUN**. **0/21 modules, 0/15 supporting routes, 0/12 batches verified.** No `main` changes, CI trigger, production database change or deployment.


### Advisors Administration staff browsing increment (2026-11-10)

- `src/screens/advisors/admin-staff.tsx`: persistent Advisors subnavigation on loading and error, accessible loading/error/count and selected member state, native form submission via Enter, required name/timezone, bounded reason/name/timezone inputs, and disabled conflicting selection/save actions. Source commit `4300c0a5c93223a5a785ae80221bdef0033770d9`.
- **Partial source evidence only.** `check:browsing-coverage`, TypeScript, lint, build, unit, authenticated browser, accessibility, role/RLS and accounting regressions **NOT RUN**. **0/21 modules, 0/15 supporting routes, 0/12 batches verified**. No main changes, CI trigger, production database changes or deployment.


### Advisors Administration onboarding browsing increment (2026-11-10)

- `src/screens/advisors/admin-onboarding.tsx`: persistent Advisors subnavigation on loading/error, accessible loading/error and engagement-count announcements, selected engagement `aria-pressed`, 5,000-character reason limit, disabled conflicting selection/input and redundant task status mutations. Source commit `2098634b9d3b7eccc1dbb6cbc0400e746d1846db`.
- **Partial source evidence only.** Task lifecycle, permissions/RLS, native history and refresh, responsive/accessibility and accounting integrity remain unverified. `check:browsing-coverage`, typecheck, lint, unit, build, authenticated browser, security and accounting regressions **NOT RUN**. **0/21 modules, 0/15 supporting routes, 0/12 batches fully verified**. No main merge, manual CI trigger, production database changes or deployment.


### Advisors Administration Services & Pricing browsing increment (2026-11-10)

- `src/screens/advisors/settings-services-pricing.tsx`: retains Advisors subnavigation in loading/error states, adds accessible status/error feedback and selected-service state, bounds change reason (5,000) and draft label (200), and blocks conflicting save/publish/restore operations; publish also respects draft validation. Source commit `381effd6b5b12bc8587ba6ed7ea40bc34c485816`.
- **Partial source evidence only.** Local `check:browsing-coverage`, TypeScript, lint, unit, build, authenticated browser, accessibility, role/RLS and accounting regressions **NOT RUN**. **0/21 modules, 0/15 supporting routes, 0/12 batches fully verified**. No main merge, CI trigger, production database change or deployment.

### Advisors Services & Pricing plan-code safety increment (2026-11-10)

- `src/screens/advisors/settings-services-pricing.tsx`: validates normalized new-plan codes (1–64 characters, initial letter, remaining letters/digits/underscore), blocks duplicate plan codes across the catalogue, prevents Add plan while catalogue mutations are pending, and supplies accessible validation hints. Source commit `8fb6d122651a070f323d4d4c77ebf19f480c1b20`.
- **Partial source evidence only.** Verify duplicate prevention, valid/invalid code behavior, draft retention, accessible feedback, role/MFA controls and save/publish workflow with authenticated fixtures. Local `check:browsing-coverage`, TypeScript, lint, unit, build, browser, security/RLS and accounting regressions **NOT RUN**. **0/21 modules, 0/15 supporting routes and 0/12 batches fully verified.** No `main` change, manual CI trigger, production database change or deployment.


### Advisors plan-code enforcement follow-up (2026-11-10)

- `src/screens/advisors/settings-services-pricing.tsx`: corrected Add plan button disabled state to enforce the existing normalized format and global duplicate checks, and added the same checks inside the click handler to prevent invalid or duplicate upserts. Source commit `0134f29b3b54c178e766115a8b814c7ba5cd7cea`.
- **Source inspection only; tests NOT RUN.** This closes a mismatch between displayed validation and the actionable button, not the full Services & Pricing workflow. All 21 modules, 15 supporting routes, and 12 batches remain unverified. No CI, main merge, database change or deployment.


### Advisors canonical plan-code duplicate handling (2026-11-11)

- `src/lib/advisors/plan-code.ts`: duplicate detection now compares normalized legacy catalogue identifiers, including case and whitespace; commit `6435066e72839d35c018970f454a1a9fd71185a9`.
- `src/lib/advisors/plan-code.test.ts`: added canonical duplicate and 64-character boundary test cases; commit `f7f3e32d676649630815f27e9641b01d95dbd7e7`.
- `src/screens/advisors/settings-services-pricing.tsx`: duplicate feedback now uses the same normalization; commit `6fb5c743d65ae6653c6e948599714bd77bdf793a`.
- **Partial source evidence only.** Vitest, TypeScript, lint, build, authenticated browser, accessibility, security/RLS, accounting regression and `check:browsing-coverage` **NOT RUN**. **0/21 modules, 0/15 supporting routes, 0/12 batches fully verified.** No main merge, CI trigger, production database change or deployment.

### Settings plan query parsing correction (2026-11-11)

- `src/routes/_authenticated/settings.tsx`: replaced literal escaped newline characters embedded in a comment with actual line breaks, restoring the `plan` query declaration and its bounded slug validation; code commit `811d02c244afc5652d955ddbe857c7d57355201c`.
- **Source-level fix only.** TypeScript, lint, unit, build, authenticated browser, accessibility, RLS/accounting regressions and `check:browsing-coverage` **NOT RUN**. Settings is not fully verified; **0/21 modules, 0/15 supporting routes, 0/12 batches** verified. No `main` changes, CI, production database changes or deployment.

### Settings billing deep-link regression foundation (2026-11-11)

- `src/lib/settings/search.ts`: extracted bounded plan and interval URL parser; commit `cd13c92348544a2ea5f0e860fa2a2e96323696a4`.
- `src/routes/_authenticated/settings.tsx`: reuses shared parser rather than inline validation; commit `a5082578d1c31fe204827b013188ad369b672a0e`.
- `src/lib/settings/search.test.ts`: four Vitest regression cases for valid, invalid, boundary-length and unsupported billing deep-link parameters; commit `98be42647cf43df8481115a452cac3e1d0075b21`.
- **Partial code evidence only.** Unit tests WRITTEN, **NOT RUN**. TypeScript, lint, build, authenticated Back/Forward/refresh/new-tab, accessibility, role/RLS/accounting and `check:browsing-coverage` **NOT RUN**. **0/21 modules, 0/15 supporting routes and 0/12 batches fully verified.** No main merge, CI trigger, production database change or deployment.

## 1. Every top-level module — tracked without exception

| # | Module | Main route | Route files | Premium browsing status |
|---:|---|---|---:|---|
| 1 | Dashboard | `/` | 1 | Partial browsing code committed; not runtime-verified |
| 2 | Banking | `/banking` | 12 | Partial browsing code committed; not runtime-verified |
| 3 | Sales | `/sales` | 26 | Partial browsing code committed; not runtime-verified |
| 4 | Purchases | `/purchases` | 25 | Partial browsing code committed; not runtime-verified |
| 5 | Contacts | `/contacts` | 6 | Partial browsing code committed; not runtime-verified |
| 6 | Products & Services | `/products-services` | 1 | Partial browsing code committed; not runtime-verified |
| 7 | Accounting | `/accounting` | 1 | Partial browsing code committed; not runtime-verified |
| 8 | Action Center | `/notifications` | 1 | Partial browsing code committed; not runtime-verified |
| 9 | Files | `/files` | 1 | Partial browsing code committed; not runtime-verified |
| 10 | Budgets | `/budgets` | 2 | Partial browsing code committed; not runtime-verified |
| 11 | Fixed assets | `/fixed-assets` | 1 | Partial browsing code committed; not runtime-verified |
| 12 | Payroll | `/payroll` | 12 | Partial report deep-link code committed; not runtime-verified |
| 13 | Reports | `/reports` | 3 | Partial browsing code committed; not runtime-verified |
| 14 | Accountant | `/accountant` | 1 | Partial checklist date URL browsing code committed; not runtime-verified |
| 15 | Firm | `/firm` | 1 | Partial native-tab browsing code committed; not runtime-verified |
| 16 | Advisors | `/advisors-admin` | 13 | Not yet verified for premium browsing |
| 17 | Advisors portal | `/advisors-portal` | 6 | Partial task status deep-link browsing code committed; not runtime-verified |
| 18 | AI Assistant | `/ai-assistant` | 1 | Partial browsing code committed; not runtime-verified |
| 19 | Tax | `/tax` | 1 | Not yet verified for premium browsing |
| 20 | Settings | `/settings` | 1 | Partial URL validation code committed; not runtime-verified |
| 21 | Help | `/help` | 1 | Partial URL-backed search code committed; not runtime-verified |

**Status meaning:** "Partial browsing code" means some navigation/state improvements are committed; tests of the complete module are not finished. "Not yet verified" does **not** mean the existing module lacks functionality; it means this initiative has not established full coverage or acceptance.

### Latest Payroll browsing implementation evidence (2026-11-07)

- `src/routes/_authenticated/payroll/reports.tsx`: validates `reportId` against the actual payroll report catalogue IDs; commit `da98e6382bfb473dbf7fbe83bc341c70c47e16df`.
- `src/screens/payroll/reports.tsx`: report selector writes a native URL search state so report selection can participate in Back/Forward, deep linking and refresh; commit `e163c19d6cbd7f7714c4e9706b0a0e1cace76cb3`.
- Scope is **one report selection workflow**, not complete Payroll coverage. Local typecheck, lint, build, unit tests, authenticated browser and `check:browsing-coverage` are **NOT RUN**. All other Payroll screens and the 12 acceptance criteria remain pending.

### Latest supporting-route implementation evidence (2026-11-07)

- `src/routes/_authenticated/profile.tsx`: native account-details form submit (including Enter key), dirty-state indication, disabled no-op save and empty-name guard; commit `001c16139edc99e3c61d1fad19a538b74995ef1c`. This is **partial source evidence only**, not completed profile or security-workflow acceptance.
- Profile password change, security settings, route transitions, browser history, tenant permissions and authenticated acceptance remain **NOT VERIFIED**. Local typecheck, lint, unit, browser and `check:browsing-coverage` remain **NOT RUN** in this connector-only execution.

### Inventory guard hardening evidence (2026-11-07)

- `scripts/check-browsing-coverage.mjs` now rejects stale summary counts for sidebar modules, authenticated routes and supporting routes, as well as duplicate acceptance-criterion identifiers.
- A module marked `fullyVerified: true` must supply exactly 12 nonempty evidence entries, one for each criterion. This is a **structural gate**, not proof that any tests passed.
- Code commit: `e95f33b95202fc1ebbf129b233096fba47f4f1cf`. Local `npm run check:browsing-coverage`, typecheck, lint, unit and browser tests: **NOT RUN**. All 21 modules remain unverified.

### Supporting-route and cross-cutting verification guard (2026-11-07)

- `scripts/check-browsing-coverage.mjs`: commit `3484d29ad8b9746d42006e063df2d63d8a9aa0f5` adds 12-entry structural evidence requirements for any supporting route or cross-cutting workflow marked fully verified, rejects unknown supporting-route evidence keys, duplicate cross-cutting areas, and malformed acceptance criteria.
- This does **not** mark any route or workflow verified. Local guard, unit, typecheck, lint, build, browser, security and accounting regression checks: **NOT RUN** (GitHub connector does not execute local scripts).

### Help Centre search accessibility increment (2026-11-08)

- `src/routes/_authenticated/help.tsx`: search now shows a screen-reader-announced matching article count and a keyboard-accessible Clear search action that preserves the URL-backed search behavior; code commit `0c456a75bbc6405cfaa743726d0e13f294f01408`.
- This is **partial source evidence only**. No claim of complete Help module acceptance. Local typecheck, lint, build, unit, authenticated browser, accessibility and `check:browsing-coverage`: **NOT RUN**.

### Sidebar inventory duplicate guard increment (2026-11-08)

- `scripts/check-browsing-coverage.mjs` now rejects duplicate top-level sidebar label/path pairs in both `src/lib/nav.ts` and the browsing manifest, and rejects invalid manifest sidebar labels or non-rooted paths. Code commit: `eae7c968a846d7305fd9301300509ea91b9c7520`.
- Manifest evidence recorded separately; this is structural inventory protection, **not** screen-level implementation or runtime acceptance. Local `check:browsing-coverage`, typecheck, lint, unit, browser, RLS and accounting regression tests: **NOT RUN**. No module or batch is marked fully verified.

### Supporting-route completeness guard (2026-11-08)

- `scripts/check-browsing-coverage.mjs` now requires an explicit nonempty status and boolean `fullyVerified` for **each** supporting route, not merely inclusion in the route inventory. Code commit `cd3f484e93eafb55762d6f9ff0939cafb7cde5c8`.
- `docs/ux/all-module-browsing-manifest.json` now records all **15 of 15** supporting routes with an explicit pending or partial status, remaining acceptance tasks, and `tests: NOT RUN`; manifest commit `b00e1d065da37b47abd87ccb4a61ebc638ec50a4`.
- This is **inventory and evidence tracking**, not a completed supporting-route implementation. **0 of 15 supporting routes and 0 of 21 modules fully verified.** Local guard, typecheck, lint, unit, build, authenticated browser, security and accounting regression: **NOT RUN**. No main-branch changes or deployment.

### Firm workspace native browsing increment (2026-11-08)

- `src/routes/_authenticated/firm.tsx`: all 12 practice tabs now have allowlisted URL search state and native links, preserving browser history, deep links and refresh. Firm selection and business permissions are unchanged. Code commit `81f6c0e8b15e679fe9f541655a430a159cb3af21` plus import cleanup.
- **Partial source evidence only**; no Firm acceptance criterion is fully verified. Local typecheck, lint, unit, build, `check:browsing-coverage`, authenticated browser, RLS and accounting tests **NOT RUN**. No changes to `main` or deployment.

### Accountant checklist date browsing increment (2026-11-08)

- `src/routes/_authenticated/accountant.tsx`: allowlisted calendar-valid `asOf` search parameter, URL-backed checklist date selection and preserved date when changing Accountant tabs; code commit `4e0feb68bd1b0c32c641776f158beb78d3826b32`.
- Partial source evidence only. Local TypeScript, lint, build, unit, authenticated browser, accessibility, `check:browsing-coverage`, security/RLS and accounting regression tests **NOT RUN**. All Accountant subworkflows and 12 acceptance criteria remain unverified. No `main` modification or deployment.


### Tax form status accessibility increment (2026-11-08)

- `src/routes/_authenticated/tax.tsx`: registration and GL mapping form status badges now expose `role="status"` and `aria-live="polite"` for unsaved/saved/view-only state announcements. Source commit `51f34961827bd021c70ffeb6c5c914323c539279`.
- This is a **partial accessibility source change only**. Screen-reader behavior, permission checks, accounting integrity, TypeScript, lint, build, unit tests, authenticated browser tests and `check:browsing-coverage` are **NOT RUN**. Tax and all 21 modules remain unverified; 0/12 batches fully accepted.

### Settings billing deep-link input validation (2026-11-08)

- `src/routes/_authenticated/settings.tsx`: `plan` search parameter now accepts only bounded 1–64 character alphanumeric/underscore/hyphen identifiers (starting with alphanumeric); rejects malformed or excessively long URL input. Source commit `40d15dc87763dd2efcafacbd81048f7d2da90ebf`.
- **Partial source evidence only.** Existing billing plan identifiers and deep links require authenticated regression verification. TypeScript, lint, build, unit, browser, billing permissions/RLS and `check:browsing-coverage`: **NOT RUN**. No module or batch marked fully verified.

### Platform billing load-error recovery increment (2026-11-08)

- `src/routes/_authenticated/platform.billing.tsx`: billing query failure now exposes an accessible `role="alert"` message and a native **Retry loading billing** action that refetches the existing permission-gated query without bypassing authorization. Code commit `0d4b281c78f88e2e6209580c8d7b3305a9539539`.
- Supporting-route manifest entry `platform.billing.tsx` records partial source evidence. **NOT RUN:** local typecheck, lint, unit, build, browsing-coverage guard, authenticated browser, accessibility, billing and RLS regressions. All 21 modules and 15 supporting routes remain unverified; 0/12 batches accepted. No `main` changes or deployment.

### Advisors Portal task status browsing increment (2026-11-08)

- `src/routes/_authenticated/advisors-portal.tasks.tsx`: bounded validated status search parameter, commit `81f87d9e5e81390a03642e02500da62f096892dd`.
- `src/screens/advisors/portal-tasks.tsx`: native URL-backed status filter links, active filter indication and empty-results feedback, commit `994560db34dddd59dcccd6b48c83184598a35c26`.
- **Partial source evidence only.** TypeScript, lint, build, unit, authenticated browser, accessibility, `check:browsing-coverage`, security/RLS and accounting regression tests **NOT RUN**. All 21 modules and 15 supporting routes remain unverified; 0/12 batches accepted. No changes to `main` or deployment.

### Advisors Portal task filter empty-state and accessibility increment (2026-11-08)

- `src/screens/advisors/portal-tasks.tsx`: adds an accessible live count of filtered versus total tasks and a native **Clear status filter** link for empty filtered results. Code commit `30ce8a7f06bbce1781894b7a1dc27251d31d2455`.
- **Partial source evidence only**. Local typecheck, lint, unit, build, authenticated browser, screen-reader, security/RLS, accounting regression and `check:browsing-coverage` **NOT RUN**. All 21 modules, 15 supporting routes and 12 batches remain unverified. No `main` modification or deployment.

### Advisors Portal appointments browsing increment (2026-11-09)

- `src/screens/advisors/portal-appointments.tsx`: loading and error states now retain portal subnavigation, loading/error status is announced accessibly, and the appointments result count has a live status. Code commit `9b944cd1a82e58dcbea191c539ff37d3f36e5b4b`.
- **Partial source evidence only.** TypeScript, lint, build, unit, authenticated browser, accessibility, `check:browsing-coverage`, RLS and accounting regression: **NOT RUN**. Appointments and all other Advisors Portal workflows still require 12-criterion acceptance. **0/21 modules, 0/15 supporting routes, 0/12 batches fully verified.** No `main` changes, CI trigger or deployment.

### Advisors Portal documents browsing increment (2026-11-09)

- `src/screens/advisors/portal-documents.tsx`: portal subnavigation retained during loading and error states, accessible status/error and document-count announcements, and bounded optional upload-reference note (500 characters). Source commit `37b04076b940f7fd309f6e1d97a7c25cdadcc04b`.
- **Partial source evidence only.** Local TypeScript, lint, unit, build, authenticated browser, screen-reader, `check:browsing-coverage`, role/RLS and accounting regressions **NOT RUN**. Existing document marking and permissions require verification. **0/21 modules, 0/15 supporting routes, 0/12 batches fully verified.** No changes to `main`, CI trigger, production database or deployment.

### Advisors Portal messages browsing increment (2026-11-09)

- `src/screens/advisors/portal-messages.tsx`: persistent portal subnavigation during loading/error, accessible status/error and message-count announcements, composer maximum of 5000 characters, and sending-state feedback; code commit `55dea3e002d97383fb16f99aad032112363c02e6`.
- **Partial source evidence only.** Local typecheck, lint, unit, build, authenticated browser, screen-reader, `check:browsing-coverage`, RLS and accounting regression **NOT RUN**. Message delivery and permissions need runtime verification. **0/21 modules, 0/15 supporting routes, 0/12 batches fully verified.** No `main` changes, CI trigger, production database change or deployment.


### Advisors Portal service-request form browsing increment (2026-11-09)

- `src/screens/advisors/portal-account.tsx`: service request uses a native submit form with required, minimum-length details; request-kind toggle buttons expose `aria-pressed` and an accessible group label. Source commit `9864d938dc4384f68ccd827dc69503ecfe6dd72b`.
- **Partial source evidence only**. TypeScript, lint, build, unit, authenticated browser, accessibility, `check:browsing-coverage`, RLS and accounting regression **NOT RUN**. **0/21 modules, 0/15 supporting routes and 0/12 batches fully verified**. No changes to `main`, CI trigger or deployment.

## 2. Internal and supporting routes also included

- `src/routes/_authenticated/documents.branding.tsx`
- `src/routes/_authenticated/documents.print.$kind.$id.tsx`
- `src/routes/_authenticated/firm-invite.$token.tsx`
- `src/routes/_authenticated/imports.tsx`
- `src/routes/_authenticated/invite.$token.tsx`
- `src/routes/_authenticated/onboarding.tsx`
- `src/routes/_authenticated/platform.automation.tsx`
- `src/routes/_authenticated/platform.billing.tsx`
- `src/routes/_authenticated/platform.index.tsx`
- `src/routes/_authenticated/platform.operations.tsx`
- `src/routes/_authenticated/platform.tsx`
- `src/routes/_authenticated/profile.tsx`
- `src/routes/_authenticated/projects.tsx`
- `src/routes/_authenticated/recurring-journals.tsx`
- `src/routes/_authenticated/route.tsx`

These include documents/printing, invitations, onboarding, import centre, platform/Superadmin/billing, profile, projects, recurring journals and authenticated app structure. They are fully in scope even where they are not individual sidebar entries.

## 3. Cross-cutting and requested capabilities — explicit gap register

| Capability | Evidence or requested context | Required follow-up |
|---|---|---|
| Expense Management and Employee Claims | Purchases employee expenses route; requested separate standalone module | Navigation/product scope reconciliation required |
| Smart Action Center | Action Center sidebar maps to /notifications | Full approvals, alerts and actions unverified |
| LinkBooks Signal / voice commands | Voice components and form adapters are internal, not standalone sidebar items | Full command and keyboard accessibility coverage pending |
| Files and Documents | Files sidebar and supporting document printing/branding routes | Folder/inbox/attachments/print workflows unverified |
| Import Centre and Migration | imports.tsx and Contacts/Purchases/Banking import routes | All import types and errors unverified |
| Recurring journals and schedules | recurring-journals.tsx, Sales/Purchases recurring | Creation, scheduling, posting and notifications unverified |
| Platform Superadmin and subscription billing | platform.* routes, Settings and Advisors billing | Role gating, payments and operations unverified |
| Customer/supplier portals and invite/onboarding | advisors-portal.*, invite and firm-invite routes | Auth, handoff, back navigation and tenant tests pending |
| Global search and universal Create New | AppShell global search and creation entry points | Search context, exact amount, permissions and every destination unverified |
| AI Assistant integrations and external automation | AI Assistant and platform automation routes | Permissions, approvals, integration error cases and UX unverified |
| Regional tax, currencies and localization | Tax, Settings, accounting surfaces | Country-gated flows and currency/timezone formatting unverified |

**Important:** A requested standalone Expense Management top-level module is not represented by a separate top-level sidebar entry in this audited source. Employee expenses currently appear under Purchases. Treat the independent navigation requirement as an unresolved scope gap and do not claim that a standalone module already exists.

Other global capabilities to validate with each applicable module include: organisation switcher, multi-tenant authorization, RLS, profile, superadmin permissions, immutable accounting postings, FX, tax, saved views, accessibility, keyboard/voice navigation, files/attachments, notifications, responsive design and localization.

## 4. Universal acceptance checks — mandatory for every module, submodule and route

1. **Navigation:** Every visible menu/submenu/tab/action opens the correct authorized screen, including deep links, breadcrumbs and active-state indicators.
2. **Workspace continuity:** Consistent shell, page heading, context toolbar, module-specific actions, linked records and return-to-origin behavior.
3. **Browser semantics:** Native Back/Forward, refresh, direct URLs, Ctrl/Cmd-click, middle-click, open new tab/window, non-destructive URL search state.
4. **Context retention:** Preserve the relevant view, filters, search, sorting, pagination, scroll, selection and unsaved draft as appropriate, without exposing private data or unsafe redirects.
5. **Forms:** New/Edit/Detail routes, drawers and dialogs have complete validated fields, keyboard flows, feedback, warnings, permission checks and real persistence.
6. **Data-rich UX:** Practical information-density, tables, mobile cards, pagination/grouping/bulk actions, real drill-downs and accessible status.
7. **Original design:** Distinct LinkBooks light/dark tokens, colour schemes, typography, responsive spacing, focus states, predictable controls, no competitor copying.
8. **Feedback and resilience:** Loading/skeleton, empty states, errors, retries, optimistic state only when safe, confirmations and idempotency.
9. **Security:** Authentication, organization isolation, roles, no stale cross-tenant data, RLS and permissions on every feature.
10. **Accounting integrity:** Accurate double-entry, AR/AP links, immutable posted records, tax/FX/rounding, reversals and locked periods where relevant.
11. **Performance and accessibility:** Measured route/search/table responsiveness, keyboard and screen-reader acceptance, small-screen and reduced-motion flows.
12. **Real verification:** Unit + integration + build + lint + role/RLS + authenticated browser + relevant accounting regression + deployment readiness with recorded evidence.

**An item is completed only after its end-to-end acceptance checks are executed and recorded.** A route existing or source helper assertions passing cannot mark a module as complete.

## 5. Planned end-to-end work packages (12 provisional batches)

| Batch | Full scope (nested screens included) |
|---:|---|
| 1 | Repository-wide route and feature inventory; PRD, HLD/LLD, design decisions, gap evidence. **Inventory is started, not fully verified.** |
| 2 | Original LinkBooks design system, theme/colour schemes, shared shell, side/top/context navigation, keyboard, global search/Create New. |
| 3 | Dashboard, Action Center/Notifications, Help, Profile, onboarding, workspace entry and permission-sensitive entry flows. |
| 4 | Sales (invoices, quotes, orders, receipts, credit notes, recurring, statements, customers, reminders, settings) plus Purchases (bills, expenses, PO, payments, credit notes, employee expenses, recurring, suppliers, statements, inbox, settings). |
| 5 | Banking (accounts, feeds, imports, transfers, rules, transactions, cash coding, reconciliation, money documents, adjustments and reconciliation reports). |
| 6 | Contacts, Products & Services, catalogue categories/price lists, requested inventory boundaries, Files/Documents, import centre and Projects. |
| 7 | Accounting (COA, journals, GL, periods, balances), recurring journals, Accountant workflows and connected Reports/report builder. |
| 8 | Tax, regional packs, Budgets, Fixed Assets, performance/FX and accounting-linked drill-down experiences. |
| 9 | Payroll, Employee Expense Claims/Expense Management, connected reimbursements, payment exports and approval flows. |
| 10 | Firm, client/practice navigation, Advisors administration and full Advisors customer portal workflows. |
| 11 | AI Assistant/LinkBooks Signal, Settings Centre, billing/subscription, platform/Superadmin, automation, integrations, localization and every cross-cutting service. |
| 12 | All-module final gap audit: security, accounting integrity, permissions/RLS, desktop/mobile/keyboard/voice, performance, full automated and authenticated acceptance tests; deployment/recovery verification. |

Every batch may require multiple small implementation increments; do not rush a whole batch or mark it complete merely because initial code is committed. New modules and internal views discovered during audit must be added to the manifest rather than omitted.

## 6. Complete authenticated route file annex (source inventory)

### Dashboard — 1 route file

- `src/routes/_authenticated/index.tsx`

### Banking — 12 route files

- `src/routes/_authenticated/banking/cash-coding.tsx`
- `src/routes/_authenticated/banking/feeds.tsx`
- `src/routes/_authenticated/banking/import.tsx`
- `src/routes/_authenticated/banking/index.tsx`
- `src/routes/_authenticated/banking/journal.$journalId.tsx`
- `src/routes/_authenticated/banking/money-documents.tsx`
- `src/routes/_authenticated/banking/reconcile.tsx`
- `src/routes/_authenticated/banking/reconciliation-report.$sessionId.tsx`
- `src/routes/_authenticated/banking/route.tsx`
- `src/routes/_authenticated/banking/rules.tsx`
- `src/routes/_authenticated/banking/transactions.tsx`
- `src/routes/_authenticated/banking/transfers.tsx`

### Sales — 26 route files

- `src/routes/_authenticated/sales/credit-notes.$creditNoteId.edit.tsx`
- `src/routes/_authenticated/sales/credit-notes.$creditNoteId.index.tsx`
- `src/routes/_authenticated/sales/credit-notes.$creditNoteId.tsx`
- `src/routes/_authenticated/sales/credit-notes.index.tsx`
- `src/routes/_authenticated/sales/credit-notes.new.tsx`
- `src/routes/_authenticated/sales/customers.tsx`
- `src/routes/_authenticated/sales/index.tsx`
- `src/routes/_authenticated/sales/invoices.$invoiceId.edit.tsx`
- `src/routes/_authenticated/sales/invoices.$invoiceId.index.tsx`
- `src/routes/_authenticated/sales/invoices.$invoiceId.tsx`
- `src/routes/_authenticated/sales/invoices.index.tsx`
- `src/routes/_authenticated/sales/invoices.new.tsx`
- `src/routes/_authenticated/sales/orders.tsx`
- `src/routes/_authenticated/sales/quotes.$quoteId.edit.tsx`
- `src/routes/_authenticated/sales/quotes.$quoteId.index.tsx`
- `src/routes/_authenticated/sales/quotes.$quoteId.tsx`
- `src/routes/_authenticated/sales/quotes.index.tsx`
- `src/routes/_authenticated/sales/quotes.new.tsx`
- `src/routes/_authenticated/sales/receipts.$receiptId.tsx`
- `src/routes/_authenticated/sales/receipts.index.tsx`
- `src/routes/_authenticated/sales/receipts.new.tsx`
- `src/routes/_authenticated/sales/recurring.tsx`
- `src/routes/_authenticated/sales/reminders.tsx`
- `src/routes/_authenticated/sales/route.tsx`
- `src/routes/_authenticated/sales/settings.tsx`
- `src/routes/_authenticated/sales/statements.tsx`

### Purchases — 25 route files

- `src/routes/_authenticated/purchases/bills.$billId.edit.tsx`
- `src/routes/_authenticated/purchases/bills.$billId.tsx`
- `src/routes/_authenticated/purchases/bills.index.tsx`
- `src/routes/_authenticated/purchases/bills.new.tsx`
- `src/routes/_authenticated/purchases/credit-notes.$creditNoteId.tsx`
- `src/routes/_authenticated/purchases/credit-notes.index.tsx`
- `src/routes/_authenticated/purchases/credit-notes.new.tsx`
- `src/routes/_authenticated/purchases/employee-expenses.tsx`
- `src/routes/_authenticated/purchases/expenses.$expenseId.tsx`
- `src/routes/_authenticated/purchases/expenses.index.tsx`
- `src/routes/_authenticated/purchases/expenses.new.tsx`
- `src/routes/_authenticated/purchases/index.tsx`
- `src/routes/_authenticated/purchases/orders.$orderId.tsx`
- `src/routes/_authenticated/purchases/orders.index.tsx`
- `src/routes/_authenticated/purchases/orders.new.tsx`
- `src/routes/_authenticated/purchases/payments.$paymentId.tsx`
- `src/routes/_authenticated/purchases/payments.batch.tsx`
- `src/routes/_authenticated/purchases/payments.index.tsx`
- `src/routes/_authenticated/purchases/payments.new.tsx`
- `src/routes/_authenticated/purchases/portal-inbox.tsx`
- `src/routes/_authenticated/purchases/recurring.tsx`
- `src/routes/_authenticated/purchases/route.tsx`
- `src/routes/_authenticated/purchases/settings.tsx`
- `src/routes/_authenticated/purchases/statements.tsx`
- `src/routes/_authenticated/purchases/suppliers.tsx`

### Contacts — 6 route files

- `src/routes/_authenticated/contacts/$contactId.tsx`
- `src/routes/_authenticated/contacts/duplicates.tsx`
- `src/routes/_authenticated/contacts/import.tsx`
- `src/routes/_authenticated/contacts/index.tsx`
- `src/routes/_authenticated/contacts/new.tsx`
- `src/routes/_authenticated/contacts/settings.tsx`

### Products & Services — 1 route file

- `src/routes/_authenticated/products-services.tsx`

### Accounting — 1 route file

- `src/routes/_authenticated/accounting.tsx`

### Action Center — 1 route file

- `src/routes/_authenticated/notifications.tsx`

### Files — 1 route file

- `src/routes/_authenticated/files.tsx`

### Budgets — 2 route files

- `src/routes/_authenticated/budgets/$budgetId.tsx`
- `src/routes/_authenticated/budgets/index.tsx`

### Fixed assets — 1 route file

- `src/routes/_authenticated/fixed-assets.tsx`

### Payroll — 12 route files

- `src/routes/_authenticated/payroll/employees.$employeeId.tsx`
- `src/routes/_authenticated/payroll/employees.index.tsx`
- `src/routes/_authenticated/payroll/index.tsx`
- `src/routes/_authenticated/payroll/payments.index.tsx`
- `src/routes/_authenticated/payroll/payslips.$payslipId.tsx`
- `src/routes/_authenticated/payroll/payslips.index.tsx`
- `src/routes/_authenticated/payroll/reports.tsx`
- `src/routes/_authenticated/payroll/route.tsx`
- `src/routes/_authenticated/payroll/runs.$runId.tsx`
- `src/routes/_authenticated/payroll/runs.index.tsx`
- `src/routes/_authenticated/payroll/salary-structures.tsx`
- `src/routes/_authenticated/payroll/settings.tsx`

### Reports — 3 route files

- `src/routes/_authenticated/reports/$reportId.tsx`
- `src/routes/_authenticated/reports/builder/$viewId.tsx`
- `src/routes/_authenticated/reports/index.tsx`

### Accountant — 1 route file

- `src/routes/_authenticated/accountant.tsx`

### Firm — 1 route file

- `src/routes/_authenticated/firm.tsx`

### Advisors — 13 route files

- `src/routes/_authenticated/advisors-admin.appointments.tsx`
- `src/routes/_authenticated/advisors-admin.billing.tsx`
- `src/routes/_authenticated/advisors-admin.clients.tsx`
- `src/routes/_authenticated/advisors-admin.conversations.tsx`
- `src/routes/_authenticated/advisors-admin.documents.tsx`
- `src/routes/_authenticated/advisors-admin.engagements.tsx`
- `src/routes/_authenticated/advisors-admin.index.tsx`
- `src/routes/_authenticated/advisors-admin.inquiries.tsx`
- `src/routes/_authenticated/advisors-admin.onboarding.tsx`
- `src/routes/_authenticated/advisors-admin.settings.services-pricing.tsx`
- `src/routes/_authenticated/advisors-admin.staff.tsx`
- `src/routes/_authenticated/advisors-admin.tsx`
- `src/routes/_authenticated/advisors-admin.workspaces.tsx`

### Advisors portal — 6 route files

- `src/routes/_authenticated/advisors-portal.account.tsx`
- `src/routes/_authenticated/advisors-portal.appointments.tsx`
- `src/routes/_authenticated/advisors-portal.documents.tsx`
- `src/routes/_authenticated/advisors-portal.index.tsx`
- `src/routes/_authenticated/advisors-portal.messages.tsx`
- `src/routes/_authenticated/advisors-portal.tasks.tsx`

### AI Assistant — 1 route file

- `src/routes/_authenticated/ai-assistant.tsx`

### Tax — 1 route file

- `src/routes/_authenticated/tax.tsx`

### Settings — 1 route file

- `src/routes/_authenticated/settings.tsx`

### Help — 1 route file

- `src/routes/_authenticated/help.tsx`


### Supporting authenticated routes

- `src/routes/_authenticated/documents.branding.tsx`
- `src/routes/_authenticated/documents.print.$kind.$id.tsx`
- `src/routes/_authenticated/firm-invite.$token.tsx`
- `src/routes/_authenticated/imports.tsx`
- `src/routes/_authenticated/invite.$token.tsx`
- `src/routes/_authenticated/onboarding.tsx`
- `src/routes/_authenticated/platform.automation.tsx`
- `src/routes/_authenticated/platform.billing.tsx`
- `src/routes/_authenticated/platform.index.tsx`
- `src/routes/_authenticated/platform.operations.tsx`
- `src/routes/_authenticated/platform.tsx`
- `src/routes/_authenticated/profile.tsx`
- `src/routes/_authenticated/projects.tsx`
- `src/routes/_authenticated/recurring-journals.tsx`
- `src/routes/_authenticated/route.tsx`

## 7. Mandatory machine-check and development safeguards

- `docs/ux/all-module-browsing-manifest.json` is the machine-readable canonical source of all sidebar modules, route files and cross-cutting gaps.
- `npm.cmd run check:browsing-coverage` compares the manifest with actual `src/lib/nav.ts` and `src/routes/_authenticated/`. Newly added modules/routes not in the manifest fail inventory verification. **Passing this check does not verify functional completeness.**
- All ChatGPT code must remain on `feature/chatgpt-premium-browsing-20261107`; **never commit, merge or push to `main`**, where Cursor is independently working.
- Do not manually trigger GitHub Actions/CI, production deploys, or production DB changes.
- Keep code completion, local tests, authenticated browser tests, merge and deployment statuses separate.
- Work sequentially, avoiding duplicate work and keeping existing accounting functionality intact.
- Progress must be based only on verified batches, with a visual bar at the end of every update. Current **fully verified batches: 0/12**.

## 8. Current evidence / limitations

- 2026-11-07 Help browsing increment: `9a4181ca3ad6fc4569bd30da440b9d47131c87b3` replaces component-only search state with bounded URL query state for shareable searches, refresh, and native history continuity; `cca5b62160437ef50052286606a4cd358acaea48` records the manifest evidence. Help remains **not fully verified**; no local checks or authenticated browser tests were executed in this run. All 12 acceptance criteria remain open until tested.


- Navigation and context preservation code is committed for Dashboard, Banking, Sales, Purchases, Contacts, Products & Services, Accounting, Action Center, Files, Budgets, Fixed Assets, Reports and AI Assistant, with Help also recorded as partially coded, including shared navigation inherited in the branch history. Banking covers transaction-to-journal return and transaction previews; Reports covers catalogue, overview, management and saved-report return navigation. Neither module is fully verified.
- Standalone helper compilations and isolated assertions have been reported, but these do not demonstrate application-wide readiness.
- Full `npm run typecheck`, `npm run lint`, `npm run build`, full `vitest`, authenticated Playwright, tenancy/security and staging/deployment verification remain outstanding for this branch.
- The two branches have diverged; integrating into `main` requires a conflict review and explicit testing. No merge is authorized merely by this coverage policy.

**Completion definition:** Every sidebar module, supporting route, internal submodule and requested approved workflow has documented acceptance evidence; unresolved entries remain visible instead of disappearing from the plan.

### Platform billing retry and amount-entry increment (2026-11-08)

- `src/routes/_authenticated/platform.billing.tsx`: loading state announces progress through `role="status"`; retry is disabled while a request is in flight and displays a retrying label; minor-unit amount field now uses required integer numeric input with nonnegative bounds and a safe-integer maximum. Code commit `c82ac912ca2cf55b1801573337544209e78e99ac`.
- **Partial source evidence only.** Server-side amount validation, permissions, publish/rollback, authenticated browser, screen-reader, TypeScript, lint, unit, build and `check:browsing-coverage`: **NOT RUN**. No module or batch is fully verified; no `main` changes, CI trigger, database mutation or deployment.

### Advisors Portal task JSX correction (2026-11-08)

- Inspected `src/screens/advisors/portal-tasks.tsx` after the task-filter accessibility change and found six literal `\\n` escape sequences embedded in JSX markup, which could break TSX compilation. Replaced them with real line breaks; code commit `000324768ece3ffb886da300592a9348241d51f4`.
- Manifest records the correction as **partial source evidence only**. TypeScript, lint, unit, build, authenticated browser, screen-reader, `check:browsing-coverage`, role/RLS and accounting regressions: **NOT RUN**. All 21 sidebar modules and 15 supporting routes remain unverified; 0/12 batches accepted. No main-branch modification, CI trigger or deployment.

### Advisors Portal account browsing increment (2026-11-09)

- `src/screens/advisors/portal-account.tsx`: portal subnavigation remains available in account loading/error states; contact edits use a native required-field form with bounded inputs; notifications expose loading/error/empty states and retry; pending actions display feedback. Code commit `ea47a3237801d20804befa34e06c46b6e0a43251`.
- **Partial source evidence only.** TypeScript, lint, unit, build, authenticated browser, accessibility, `check:browsing-coverage`, RLS and accounting regression **NOT RUN**. All 21 modules, 15 supporting routes and 12 acceptance batches remain unverified. No `main` changes or deployment.

### Advisors Portal Account draft-preservation increment (2026-11-09)

- 2026-11-09 Advisors Portal Account: contactDirty prevents background home refetch overwriting unsaved contact edits; Save disabled until edited; reset after successful refresh; Mark all read only when unread items exist; mutation errors surfaced via toast. Code commits 3bee4ccf011f5571597e5b3f525bcdca4578edfa and 0098ed9375947f09069b7418018f848bf512dceb. Source evidence only; local tests, browser, typecheck, coverage guard NOT RUN; module NOT verified.

### Advisors administration overview navigation and accessibility increment (2026-11-09)

- `src/screens/advisors/admin-overview.tsx`: preserves `AdvisorsSubnav` during loading and error states, announces loading/errors and provides a labelled metric region plus loaded-state announcement. Source commit `2c6e9ead7f0db6fb9029d63073f60dd4e5aac71f`.
- **Partial source evidence only**; Advisors administration and all 21 modules remain not fully verified. Local TypeScript, lint, unit, build, authenticated browser, accessibility, `check:browsing-coverage`, RLS and accounting regression: **NOT RUN**. No changes to `main`, no CI trigger, no production migration or deployment. **0/12** accepted batches.

### Advisors Administration inquiries browsing increment (2026-11-09)

- `src/screens/advisors/admin-inquiries.tsx`: retains Advisors subnavigation during loading and both inquiry/staff error states; retries both queries; announces inquiry counts; disables conflicting and no-op actions. Source commit `e286ab54ad3f6402ecc451bc1f10bd5460002093`.
- Manifest evidence commit `a29ecab3cb91b458d151068fb93c9876b061b231`. **Partial source evidence only**; no claim of runtime behavior or 12-criterion acceptance. Local `check:browsing-coverage`, TypeScript, lint, build, unit, authenticated browser, accessibility, RLS and accounting regression checks **NOT RUN**. **0/21 modules, 0/15 supporting routes and 0/12 batches fully verified**. No `main` changes, CI trigger or deployment.

### Advisors Administration conversations browsing increment (2026-11-09)

- `src/screens/advisors/admin-conversations.tsx`: persistent Advisors subnavigation on loading/error, combined staff/list retry, accessible result count, pending assignment protection, disabled no-op status/notes actions and 5000-character notes bound. Source commit `fe8342e70d4291b0674b13f7bd6ab3f62b8d7580`.
- **Partial source evidence only**. TypeScript, lint, unit, build, authenticated browser, screen-reader, `check:browsing-coverage`, RLS and accounting regressions **NOT RUN**. **0/21 modules, 0/15 supporting routes, 0/12 batches fully verified**. No changes to `main`, CI trigger, database or deployment.

### Advisors plan-code whitespace normalization correction (2026-11-10)

- `src/screens/advisors/settings-services-pricing.tsx`: corrected the whitespace replacement regex from a literal backslash-s matcher to the actual whitespace matcher, so spaces/tabs in a new plan code normalize to underscores before existing validation and duplicate checks. Source commit `d9b321a381c7afb7ada0c1a0b44b39ec53a923c0`.
- **Source inspection only.** Local inventory guard, TypeScript, lint, unit, browser, accessibility, security and accounting regressions **NOT RUN**. Baseline remains 21 sidebar modules, 132 authenticated routes (15 supporting), 0 fully verified modules and 0/12 verified batches. No main merge, CI trigger, database change or deployment.

### Advisors plan-code regression coverage increment (2026-11-10)

- `src/lib/advisors/plan-code.ts` extracts normalization and uniqueness/format validation; `src/lib/advisors/plan-code.test.ts` adds four Vitest cases for whitespace, invalid codes, valid codes and case-insensitive duplicates. `src/screens/advisors/settings-services-pricing.tsx` uses the helper. Commits `14ac653105b1f46c67f85ffe5d24c503403149d1`, `0c0fb4247e167d4d131683ada27be4154e7c0449`, `c7ffd57f227290bc08b0d68dab877c3298f5c8cc`.
- **Tests WRITTEN, NOT RUN.** Local coverage guard, typecheck, lint, build, Vitest, browser, role/RLS and accounting regression NOT RUN. **0/21 modules, 0/15 supporting routes, 0/12 batches fully verified**. No main merge, CI, database change or deployment.

### Settings nested panel refresh navigation fix (2026-11-11)

- `src/lib/settings/search.ts`: the route search parser previously discarded allowlisted `settingsPanel` and `settingsTrail` parameters, breaking refresh and deep links for nested in-place Settings panels. The parser now reuses `validateSettingsPanelSearch` to preserve valid panel/trail state without accepting arbitrary values. Commit `1989cd9f8db700a83f1fc38039338626981f430f`.
- `src/lib/settings/search.test.ts`: two new regression cases for nested refresh state and malicious/invalid panel history; commit `12cc76cdb059073ad8efc2ed45f5a98080b5bfc3`.
- **Partial source evidence only:** tests, typecheck, lint, build, `check:browsing-coverage`, authenticated browser, accessibility, RLS and accounting regressions **NOT RUN**. **0/21 modules, 0/15 supporting routes, 0/12 batches verified.** No `main` merge, CI, database change or deployment.
