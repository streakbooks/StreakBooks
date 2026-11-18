# LinkBooks — Complete All-Module Premium Browsing Coverage

### Settings inherited navigation-slot validation (2026-11-18)

- `src/lib/settings/panels.ts`: reject prototype-inherited array slots in `settingsTrail` during deep-link restoration, so only explicitly owned ancestor positions are accepted. Code commit `fddfb10594f6d1e787d10d4dbef850d6df8e5ebf`. **SOURCE ONLY; NOT RUN.**
- `src/lib/settings/panels.test.ts`: add inherited-slot history regression; commit `0f241f463c3bf9e5c903266c1fdc321ad0732db8`. **WRITTEN, NOT RUN.**
- `docs/ux/all-module-browsing-manifest.json`: Settings partial evidence updated in `97866ee12a5b3e04230ffe7aaefdb35895040fcb`. **NOT RUN:** browsing inventory guard, TypeScript, lint, Vitest, build, authenticated browser/accessibility, security/RLS and accounting regression. Baseline remains 21 sidebar modules, 132 authenticated route files (15 supporting), 11 cross-cutting workflows; **0/21 modules, 0/15 supporting routes, 0/12 batches fully verified.** No main changes, manually triggered CI, production database changes or deployment.


### Settings validated panel persistence (2026-11-18)

- `src/lib/settings/panels.ts`: `openSettingsPanel` now writes the allowlist-validated `safePanel` to URL state rather than the untrusted caller argument; commit `7b1cb44dd65bccc05a4b08a3d31b1b91ff33e589`. **SOURCE ONLY; NOT RUN.**
- `src/lib/settings/panels.test.ts`: new regression covers validated panel persistence, unrelated query retention, refresh validation and contextual Close; commit `f3a4e87d972a2a51dd2d9037ceb1a8732ae3b761`. **WRITTEN, NOT RUN.**
- Manifest updated in `cc11037b92fd4ec343b93013011793d00486b554`. **NOT RUN:** inventory guard, TypeScript, lint, Vitest, build, authenticated browser/accessibility, security/RLS and accounting regression. Baseline 21 sidebar modules, 132 authenticated routes (15 supporting), 11 cross-cutting workflows. **0/21 modules, 0/15 supporting routes, 0/12 batches verified.** No main, manual CI, production database or deployment changes.


### Settings runtime open-panel allowlist (2026-11-18)

- `src/lib/settings/panels.ts`: `openSettingsPanel` now rejects invalid runtime panel targets without modifying existing URL state; commit `89d051fc2fb770acd30c8e25785c529306b6010f`. **SOURCE ONLY; NOT RUN.**
- `src/lib/settings/panels.test.ts`: invalid runtime panel target and valid nested return regression added; commit `df65d56ad367e77188b439135a80ae8866631208`. **WRITTEN, NOT RUN.**
- Manifest evidence updated in commit `6b6a1444e1208b87bf857b849eb01a854a3458e6`. No criteria or module fully verified. **NOT RUN:** local inventory guard, TypeScript, lint, unit/integration, build, authenticated browser, accessibility, RLS/accounting regression. Baseline remains 21 sidebar modules, 132 authenticated routes (15 supporting), 11 cross-cutting workflows. **0/21 modules, 0/15 supporting routes, 0/12 batches verified.** No changes to main, manual CI, production database or deployment.


### Settings section-derived destination allowlist (2026-11-18)

- `src/lib/settings/panels.ts`: section-derived `/settings` destinations now pass through `parseSettingsPanel`, rejecting invalid runtime sections rather than generating unrecognized `category:*` panels. Code commit `d396baf3c72ac163da84a50536cc17cc4fc8eb1c`. **SOURCE ONLY; NOT RUN.**
- `src/lib/settings/panels.test.ts`: add invalid section and valid banking category regression cases, commit `bde74e52edae4a1ee3aec33398085ed74e457def`. **WRITTEN, NOT RUN.**
- Manifest updated; no module or acceptance criterion fully verified. **NOT RUN:** browsing inventory guard, TypeScript, lint, Vitest, build, authenticated browser, accessibility, security/RLS, accounting regression. Baseline 21 sidebar modules, 132 authenticated route files (15 supporting), 11 cross-cutting workflows; **0/21 modules, 0/15 supporting routes, 0/12 batches fully verified**. No `main` changes, manual CI, production DB or deployment.


### Settings explicit destination panel allowlist (2026-11-18)

- `src/lib/settings/panels.ts`: validate `destination.panel` at runtime through `parseSettingsPanel` rather than trusting a TypeScript annotation; source commit `878ffd1256d37ed160fa10c304a622d62c965bc2`. **SOURCE ONLY; NOT RUN.**
- `src/lib/settings/panels.test.ts`: add malformed explicit destination regression cases; commit `759872188a450209049a29783033a2820144033c`. **WRITTEN, NOT RUN.**
- `docs/ux/all-module-browsing-manifest.json`: record partial Settings evidence; no acceptance criterion or module fully verified. **NOT RUN:** local `check:browsing-coverage`, TypeScript, lint, Vitest, build, authenticated browser, accessibility, security/RLS and accounting regression. Documented baseline: 21 sidebar modules, 132 authenticated route files (15 supporting), 11 cross-cutting workflows. **0/21 modules, 0/15 supporting routes, 0/12 batches fully verified.** No main changes, manual CI, production database operations or deployment.


### Settings sparse nested-history validation (2026-11-18)

- `src/lib/settings/panels.ts`: reject sparse `settingsTrail` arrays containing holes, which `Array.every` otherwise skips, preventing undefined ancestor IDs from surviving URL-backed Settings navigation. Code commit `75b87dc1a819f93ad12667722dd4ba5f02a21698`. **SOURCE ONLY; NOT RUN.**
- `src/lib/settings/panels.test.ts`: regression for sparse refresh history and safe panel opening; test commit `8d4dcbeea92cf30d3905be8ea0f6279f13fa09e8`. **WRITTEN, NOT RUN.**
- Manifest updated with partial Settings evidence; no module/workflow marked fully verified. **NOT RUN:** local inventory guard, Vitest, TypeScript, lint, build, authenticated browser, accessibility, RLS/accounting regression. Baseline remains 21 sidebar modules, 132 authenticated routes (15 supporting), 11 cross-cutting workflows; **0/21 modules, 0/15 supporting routes, 0/12 batches fully verified**. No main changes, manual CI, production DB or deployment.


### Payroll payment records table accessibility (2026-11-18)

- `src/screens/payroll/payments.tsx`: add `aria-label="Payroll payment records"` to the payment records table so assistive technology can identify the table independently of adjacent filters. Source commit `54f915dc76363fad343ec955b1c4034861ee0b0f`. **SOURCE ONLY; NOT RUN.** No payment, reversal or journal operations changed.
- `docs/ux/all-module-browsing-manifest.json`: record partial Payroll evidence and pending assistive-technology verification; commit `24f11405b883e29818b17fb6638b7838690c62af`.
- **NOT RUN:** local inventory guard, TypeScript, lint, unit/integration, build, authenticated browser/screen reader, RLS/accounting regression. Baseline 21 sidebar modules, 132 authenticated routes (15 supporting), 11 cross-cutting workflows; fully verified 0/21 modules, 0/15 supporting routes, 0/12 batches. No main changes, manual CI, production DB or deployment.

### Payroll payment allocation list accessibility (2026-11-18)

- `src/screens/payroll/payments.tsx`: add an accessible name to the payment-details payslip allocation list, preserving existing allocation display and accounting operations. Source commit `fa411208b4cd3f56647f3f1448a3b2a48eb96806`. **SOURCE ONLY; NOT RUN.**
- `docs/ux/all-module-browsing-manifest.json`: append Payroll source evidence and pending assistive-technology verification; commit `13fd7c52c8de6b973a202e4ea084f0db03eb3474`.
- **NOT RUN:** inventory guard, TypeScript, lint, unit/integration, build, authenticated browser/screen-reader, RLS/accounting regressions. Baseline 21 sidebar modules, 132 authenticated routes (15 supporting), 11 cross-cutting workflows. Fully verified 0/21 modules, 0/15 supporting routes, 0/12 batches. No main changes, manual CI, production database operations or deployment.

### Payroll payment refresh accessibility announcement (2026-11-18)

- `src/screens/payroll/payments.tsx`: add a polite screen-reader status message during payment-detail refetch, while retaining the dialog and existing refresh action. Source commit `0eb60648d7479a6f27a144942761e46817aeca68`. **SOURCE ONLY; NOT RUN.** No settlement, reversal, or accounting code changed.
- `docs/ux/all-module-browsing-manifest.json`: record Payroll partial evidence and outstanding screen-reader verification in commit `facc843380b930a082012458e0336861da4a91f5`.
- **NOT RUN:** inventory guard, TypeScript, lint, unit/integration tests, build, authenticated browser and screen-reader accessibility, RLS/accounting regressions. Documented baseline 21 sidebar modules, 132 authenticated routes (15 supporting), 11 cross-cutting workflows. Fully verified 0/21 modules, 0/15 supporting routes, 0/12 batches. No changes to main, manual CI, production database or deployment.

### Payroll payment detail in-dialog refresh (2026-11-18)

- `src/screens/payroll/payments.tsx`: loaded payment details dialog now exposes a keyboard-focusable **Refresh details** control using the existing payment detail query refetch, disabled while fetching. Retains dialog context and does not change settlement, reversal or journal code. Source commit `918f1cab1384b6bf9eecded2b31ddb7c3ace420f`. **SOURCE ONLY; NOT RUN.**
- `docs/ux/all-module-browsing-manifest.json`: Payroll partial evidence and pending browser checks updated in commit `7a0794a3547a48eb150fb7095cc9edeb607c5280`.
- **NOT RUN:** local inventory guard, TypeScript, lint, unit/integration, build, authenticated browser refresh/keyboard/accessibility, security/RLS and accounting regression. Baseline 21 sidebar modules, 132 authenticated routes (15 supporting), 11 cross-cutting workflows; 0/21 modules, 0/15 supporting routes, 0/12 batches fully verified. No main, manual CI, production DB or deployment changes.

### Payroll settlement form query retry (2026-11-17)

- `src/screens/payroll/payments.tsx`: add inline Retry settings, Retry payslips and Retry accounts buttons for three failed settlement-form queries, invoking their existing React Query refetch methods. Source commit `771e402b4175f28f55135ab488c517ce4e4903e8`. **SOURCE ONLY; NOT RUN.** Posting, reversal and accounting calculations unchanged.
- `docs/ux/all-module-browsing-manifest.json`: record partial source evidence and outstanding verification; commit `be2998740c89f46a1d9b8200fe5d25c1a44f2252`.
- **NOT RUN:** inventory guard, TypeScript, lint, unit/integration, build, authenticated browser retry/keyboard/accessibility, RLS/accounting regression. Documented baseline 21 sidebar modules, 132 authenticated routes (15 supporting), 11 cross-cutting workflows; fully verified 0/21 modules, 0/15 supporting routes, 0/12 batches. No `main`, manual CI, production DB or deployment changes.

### Payroll Payments detail query retry (2026-11-17)

- `src/screens/payroll/payments.tsx`: payment detail query errors now use the shared `ErrorState` with an explicit retry action (`paymentDetailQ.refetch()`), rather than an error message with no recovery control. Source commit `4d072d4432d5da94ac09bd0772dc6589df691433`. **SOURCE ONLY; NOT RUN.** No payment posting, reversal or journal logic changed.
- `docs/ux/all-module-browsing-manifest.json`: Payroll partial evidence updated in commit `7cf56b525a16f2997cc526e683af1688db93e1db`.
- **NOT RUN:** local inventory guard, TypeScript, lint, unit/integration tests, build, authenticated browser error/retry/accessibility, RLS/accounting regression. Baseline 21 sidebar modules, 132 authenticated route files (15 supporting), 11 cross-cutting workflows; fully verified 0/21 modules, 0/15 supporting routes, 0/12 batches. No main, manual CI, production DB or deployment changes.


### Payroll Payments linked data-cell detail actions (2026-11-17)

- `src/screens/payroll/payments.tsx`: method, amount, reference and status cells now expose keyboard-focusable buttons opening the existing payment details dialog, in addition to the previously linked date cell. Source commit `41c9b5c5a9abadcf780350e5c19ceca7f25c5cb7`. **SOURCE ONLY; NOT RUN.** This does **not** create a native URL-backed payment detail route or guarantee browser Back/Forward/new-tab behavior.
- `docs/ux/all-module-browsing-manifest.json`: Payroll partial evidence recorded in commit `c24cd99afc35d98cacb9cd16710378527f47cc2d`.
- **NOT RUN:** inventory guard, TypeScript, lint, unit/integration tests, build, authenticated browser/keyboard/accessibility, RLS/accounting regression. Baseline 21 sidebar modules, 132 authenticated routes (15 supporting), 11 cross-cutting workflows; fully verified 0/21 modules, 0/15 supporting routes, 0/12 batches. No changes to main, manual CI, production database or deployment.

### Payroll Payments date-cell detail action (2026-11-17)

- `src/screens/payroll/payments.tsx`: payment-date cells now provide a keyboard-focusable button opening the existing payment details dialog, rather than inert date text. Source commit `a2e79503e64719873887c2836c2c602159ea073a`. This is a dialog action, **not a native deep link**; native URL-backed payment detail remains pending. **SOURCE ONLY; NOT RUN.**
- `docs/ux/all-module-browsing-manifest.json`: Payroll partial evidence recorded in commit `2c66cfbc597c212d05c783c65b1d9df91c16c093`.
- **NOT RUN:** inventory guard, TypeScript, lint, unit tests, build, authenticated browser and keyboard/accessibility, RLS/accounting regressions. Documented baseline 21 sidebar modules, 132 authenticated routes (15 supporting), 11 cross-cutting workflows; fully verified 0/21 modules, 0/15 supporting routes, 0/12 batches. No changes to main, manual CI, production database or deployment.

### Payroll Payments native return-to-run link (2026-11-17)

- `src/screens/payroll/payments.tsx`: filtered payments alert now provides a native, keyboard-focusable **View payroll run** link to `/payroll/runs/$runId` with the `payments` tab selected. Source commit `8e8308d00427e37c6f7eb5698125a4201a8cd8db`. **SOURCE ONLY; NOT RUN.** Existing settlement posting, reversal, permissions and journals unchanged.
- `docs/ux/all-module-browsing-manifest.json`: Payroll partial evidence updated in commit `d4ce201ba143d0a735ece2afe4ff89db5100b2bd`.
- **NOT RUN:** local `check:browsing-coverage`, TypeScript, lint, unit, build, authenticated browser Back/Forward/new-tab/refresh, accessibility and RLS/accounting regression. Baseline 21 sidebar modules, 132 authenticated routes (15 supporting), 11 cross-cutting workflows; fully verified 0/21 modules, 0/15 supporting routes, 0/12 batches. No changes to `main`, manually triggered CI, production database or deployment.

### Payroll Payments native run-filter clearing (2026-11-17)

- `src/screens/payroll/payments.tsx`: replace imperative Clear run filter button navigation with a native, keyboard-focusable TanStack Link to `/payroll/payments`, omitting `runId`. This supports normal browser link/new-tab semantics without touching payroll payment or journal logic. Source commit `9e5ab9a4a9583a4ad62829108d7f327773b75c52`. **SOURCE REVIEW ONLY; NOT RUN.**
- `docs/ux/all-module-browsing-manifest.json`: record Payroll partial evidence and pending checks; commit `b878301cac75c813e2c709e25891dfda39f6acd9`.
- **NOT RUN:** local `check:browsing-coverage`, TypeScript, lint, unit, build, authenticated browser Back/Forward/new-tab/refresh, accessibility and RLS/accounting regression. Baseline 21 sidebar modules, 132 authenticated routes (15 supporting), 11 cross-cutting workflows; 0/21 modules, 0/15 supporting routes, 0/12 batches fully verified. No changes to `main`, manual CI, production database or deployment.

### Payroll Payments persistent native navigation (2026-11-17)

- `src/screens/payroll/payments.tsx`: retain PageHeader and PayrollSubnav in company loading, missing-company, payroll.view denial, payments loading and payments-query error states, allowing native navigation out of blocked views. Source commit `6bcddb2452f1852343067ba672e5b8d62797bb09`. **SOURCE REVIEW ONLY; NOT RUN.** No payment posting, reversal, permission or accounting logic changed.
- `docs/ux/all-module-browsing-manifest.json`: Payroll partial evidence updated in commit `fe6c87c50f865cd154a904a3e4299c81aa3a05da`. No criterion, module or workflow marked fully verified.
- **NOT RUN:** local `check:browsing-coverage`, TypeScript, lint, unit, build, authenticated browser Back/Forward/new-tab/refresh, accessibility, RLS/accounting regression. Baseline remains 21 sidebar modules, 132 authenticated routes (15 supporting), 11 cross-cutting workflows. Fully verified 0/21 modules, 0/15 supporting routes, 0/12 batches. No main, manual CI, production DB or deployment changes.

### Payroll Runs payment, status and net-pay native links (2026-11-17)

- `src/screens/payroll/runs.tsx`: Payment, Status and Net pay cells now link natively to the payroll run detail, retaining status, normalized search draft and sort return context. Keyboard focus and new-tab semantics are supported by native links. Source commit `71c3752c02ecf46cac2df35f3d1d3f819cb149db`. **SOURCE REVIEW ONLY, NOT RUN.**
- `docs/ux/all-module-browsing-manifest.json`: Payroll partial source evidence updated in commit `e9c49acf83ff00e74a039979563e52b0744102cd`. No acceptance criterion or module is fully verified.
- **NOT RUN:** local `check:browsing-coverage`, TypeScript, lint, unit tests, build, authenticated browser Back/Forward/new-tab/refresh, accessibility, RLS/accounting regressions. Baseline remains 21 sidebar modules, 132 authenticated routes (15 supporting), 11 cross-cutting workflows. Fully verified 0/21 modules, 0/15 supporting routes, 0/12 batches. No changes to `main`, manual CI, production DB or deployment.

### Payroll Runs native schedule and period links (2026-11-17)

- `src/screens/payroll/runs.tsx`: schedule and period table cells now provide keyboard-focusable native links to run detail, preserving current status, validated search draft and sort return context. Source commit `06fc1e49c6adbb6d8062247445c94da904de79cb`. **SOURCE REVIEW ONLY, NOT RUN.**
- `docs/ux/all-module-browsing-manifest.json`: Payroll evidence updated in commit `d9fef54585f7c454b78fe7fba304c7d4b7a6fce3`. Other cells, subroutes and all 12 criteria remain pending.
- **NOT RUN:** local `check:browsing-coverage`, TypeScript, lint, unit, build, authenticated browser, accessibility, RLS/accounting regressions. Baseline 21 sidebar modules, 132 authenticated routes (15 supporting), 11 cross-cutting workflows. Verified 0/21 modules, 0/15 supporting routes, 0/12 batches. No `main`, manual CI, production DB or deployment changes.

### Payroll Runs draft-to-detail return context (2026-11-17)

- `src/screens/payroll/runs.tsx`: use the validated current `searchDraft` instead of potentially stale URL `runSearch` when constructing existing-run detail links; also validate the newly created run return context. Commit `86324ceb768058c7f80357f5ce6b134b31f5245a`. **SOURCE REVIEW ONLY, NOT RUN.**
- `docs/ux/all-module-browsing-manifest.json`: Payroll matrix evidence updated in commit `aff3c94bd3fec0f8cbeba24f0d893baf2ad84c0e`. No criterion or workflow marked fully verified.
- **NOT RUN:** `check:browsing-coverage`, typecheck, lint, unit tests, build, authenticated browser navigation, accessibility, security/RLS, accounting regressions. Documented baseline 21 sidebar modules, 132 authenticated routes (15 supporting), 11 cross-cutting workflows; 0/21 modules, 0/15 supporting routes, 0/12 batches verified. No main, manual CI, production DB or deployment changes.

### Payroll Runs multiword search composition (2026-11-17)

- `src/screens/payroll/runs.tsx`: retain a local search draft while the user types, so spaces in multiword queries are not removed by the route's normalized URL validator on each keystroke. Apply draft filtering immediately, commit normalized search to URL on blur/Enter, and preserve the draft search in detail return links. Commits `6f85aacd65470997eb2ea080d0555f7f737dd51b` and `73083cca511b12f9b7a7d1842de338137b431a22`. **SOURCE ONLY, NOT RUN.**
- `docs/ux/all-module-browsing-manifest.json`: Payroll evidence and remaining acceptance verification updated. No module marked fully verified.
- **NOT RUN:** `check:browsing-coverage`, TypeScript, lint, Vitest, build, authenticated browser Back/Forward/refresh/new-tab, accessibility, security/RLS and accounting regressions. Baseline 21 sidebar modules, 132 authenticated route files (15 supporting), 11 registered cross-cutting workflows. Fully verified 0/21 modules, 0/15 supporting routes, 0/12 batches. No changes to `main`, manual CI, production database or deployment.

### Payroll runs search deep-link normalization (2026-11-17)

- `src/lib/payroll/run-search.ts`: trim padded Payroll Runs search, omit blank-only values, enforce 120-character effective length and reject invisible/control formatting characters; commit `c1b5a7f435389cf76e9a6ca394f0aa06a5c2a6ae`. SOURCE ONLY.
- `src/routes/_authenticated/payroll/runs.index.tsx`: apply validated search in native URL route while retaining status and sort validation; commit `541e60cdfc9e3bb9d0b6f4ccfab13969a69c1605`. SOURCE ONLY.
- `src/lib/payroll/run-search.test.ts`: add four regression cases for padded, blank, length, unsafe and multilingual search; commit `f6ab24aa9bbc44b883dd207ab8cc2bdae23ee72e`. WRITTEN, NOT RUN.
- `docs/ux/all-module-browsing-manifest.json`: Payroll evidence and remaining checks updated; commit `5c9dfa58730890dde0ee146c9396c9c97e20c901`.
- **NOT RUN:** local inventory guard, TypeScript, lint, Vitest, build, authenticated browser, accessibility, RLS/accounting regression. Documented baseline 21 sidebar modules, 132 authenticated route files (15 supporting), 11 cross-cutting workflows. Fully verified 0/21 modules, 0/15 supporting routes, 0/12 batches. No main, manually triggered CI, production database or deployment changes.

### Fixed Assets zero-width search deep-link validation (2026-11-16)

- `src/lib/fixed-assets/register-navigation.ts`: reject U+200B–U+200D and U+2061–U+2064 invisible search characters; commit `b0be75bea78a08976c05d7b28da60c7d6f0e4b3b`. SOURCE ONLY.
- `src/lib/fixed-assets/register-navigation.test.ts`: extend invisible-character regression while retaining independent sort; commit `261b3f810f3f31abf13f5805c6cf2b3dd09935fb`. WRITTEN, NOT RUN.
- `docs/ux/all-module-browsing-manifest.json`: source and outstanding verification evidence updated; commit `ca52c2da375d76b5930a98cfeb16b28f9fea44b6`.
- **NOT RUN:** inventory guard, typecheck, lint, Vitest, build, authenticated browser, accessibility, RLS/accounting regression. Baseline 21 sidebar modules, 132 authenticated route files (15 supporting), 11 cross-cutting workflows; fully verified 0/21 modules, 0/15 supporting routes, 0/12 batches. No main, manual CI, production DB or deployment changes.

### Fixed Assets invisible-search character regression (2026-11-16)

- `src/lib/fixed-assets/register-navigation.ts`: reject U+2060 word joiner and U+FEFF BOM from URL-restored register search while retaining independent filters; commit `09e48d48df1e113486a32828adda59d7a73ebb04`. SOURCE ONLY.
- `src/lib/fixed-assets/register-navigation.test.ts`: regression checks both characters and independent sort retention; commit `f9503cbaddff6de086d103543e00f13958e60684`. WRITTEN, NOT RUN.
- Manifest evidence updated in commit `44497c944c3792646427023ff1e6bd6c5bdfcab5`. Inventory guard, TypeScript, lint, Vitest, build, authenticated browser, accessibility, RLS/accounting regression **NOT RUN**. Baseline 21 modules, 132 authenticated routes (15 supporting), 11 cross-cutting workflows. Verified 0/21 modules, 0/15 supporting routes, 0/12 batches. No main, manual CI, production DB or deployment changes.

### Fixed Assets Unicode regression input correction (2026-11-16)

- `src/lib/fixed-assets/register-navigation.test.ts`: replace literal backslash text with actual JavaScript escaped control codepoints in the search-safety regression; commit `4a7cd1a03be1c50dacc613f81ed3551992b93898`. Previous test inputs did not exercise the unsafe-character branch. **WRITTEN, NOT RUN.**
- Manifest Fixed assets evidence updated in commit `417afe98630354c8308c90d3079d4616e11cd169`. No acceptance criterion marked verified.
- **NOT RUN:** local `check:browsing-coverage`, TypeScript, lint, Vitest, build, authenticated browser, accessibility, RLS/accounting regression. Documented baseline: 21 modules, 132 authenticated routes (15 supporting), 11 cross-cutting workflows. Fully verified 0/21 modules, 0/15 supporting routes, 0/12 batches. No main, CI, production DB or deployment changes.

### Fixed Assets register deep-link search validation (2026-11-16)

- `src/lib/fixed-assets/register-navigation.ts`: trim effective search, omit blank-only queries, enforce 120-character normalized length, reject control and bidi formatting characters while retaining other filters; commit `e838e82f7728d0cb5eb66b763b11eca69fd04915`. SOURCE ONLY.
- `src/lib/fixed-assets/register-navigation.test.ts`: add padded/boundary, multilingual and unsafe-control regression cases; commit `0c3f20dbefc6f3472605751c5e8533ce06a618a0`. WRITTEN, NOT RUN.
- `docs/ux/all-module-browsing-manifest.json`: record partial evidence and outstanding acceptance work; commit `1c1169654ca71030933ba02d4a2164a582817408`.
- **NOT RUN:** local `check:browsing-coverage`, TypeScript, lint, Vitest, build, authenticated browser, accessibility, RLS and accounting regressions. Documented baseline remains 21 modules, 132 authenticated route files (15 supporting), 11 cross-cutting workflows. Fully verified: 0/21 modules, 0/15 supporting routes, 0/12 batches. No main changes, manual CI, production DB changes or deployment.

### Budgets native return-search validation (2026-11-16)

- `src/lib/budgets/budget-navigation.ts`: normalize padded search terms, enforce 100-character effective limit, reject invisible control characters and ambiguous duplicate `q` parameters; commit `2b8bacae83268f2cea80987f30daffc860b4f0be`. Source change only.
- `src/lib/budgets/budget-navigation.test.ts`: add padded/blank/boundary, duplicate query and Unicode-control regression cases; commit `3dbec6f7ac768733e9f35af81e33a0067a2803e4`. **WRITTEN, NOT RUN.**
- `docs/ux/all-module-browsing-manifest.json`: update Budgets partial evidence and remaining checks; commit `493f429af2332b90208f8b5f0d9d9d70f5daeb91`.
- **NOT RUN:** local inventory guard, TypeScript, lint, Vitest, build, authenticated browser, accessibility, RLS/accounting regressions. Baseline 21 modules, 132 authenticated routes (15 supporting), 11 cross-cutting workflows. 0/21 modules, 0/15 supporting routes, 0/12 batches fully verified. No changes to main, manually triggered CI, production DB or deployment.

### Banking return-search whitespace normalization (2026-11-16)

- `src/lib/banking/transaction-return.ts`: trim padded return-context search, omit blank-only search and enforce the 120-character limit on effective text while retaining independent filters; commit `03b84b29149114818dbf0f957d750a1223b8a9f9`.
- `src/lib/banking/transaction-return.test.ts`: add blank, padded multilingual, URL decoding and 120/121-character regressions; commit `d4bda144e93a6ba0d34495d185c0921f086bd120`. **WRITTEN, NOT RUN.**
- `docs/ux/all-module-browsing-manifest.json`: Banking source evidence and remaining acceptance work updated; commit `013e3b875ff2433d4789da2a2c8f72cf9848c803`.
- **NOT RUN:** inventory guard, typecheck, lint, Vitest, build, authenticated browser, accessibility, RLS/accounting regressions. Documented baseline 21 modules, 132 authenticated routes (15 supporting), 11 cross-cutting workflows; 0/21 modules, 0/15 supporting routes, 0/12 batches fully verified. No changes to main, manually triggered CI, production database or deployment.

### Hyphenated verification-status integrity (2026-11-16)

- `scripts/check-browsing-coverage.mjs`: normalize hyphens and underscores before checking contradictory `fullyVerified` status strings, so `not-run`, `not-tested` and `not-verified` cannot evade the existing guard. Source commit `292c7514e33e5bda265b5a4f5b0eb30aa22e34c8`.
- `docs/ux/all-module-browsing-manifest.json`: inventory guard evidence updated; commit `3b64cb2a9c97f12e8bf1390204379dc04d6fd5f8`.
- **SOURCE REVIEW ONLY; NOT RUN:** local `check:browsing-coverage`, typecheck, lint, unit tests, build, authenticated browser/accessibility, RLS and accounting regression. Baseline remains 21 sidebar modules, 132 authenticated routes (15 supporting), 11 cross-cutting workflows; 0/21 modules, 0/15 supporting routes and 0/12 batches fully verified. No changes to `main`, manual CI, production DB or deployment.

### Verified-status consistency guard (2026-11-16)

- `scripts/check-browsing-coverage.mjs`: fully verified modules, supporting routes and cross-cutting workflows now reject contradictory `partial`, `pending`, `unverified`, `not verified`, `not tested`, `not run`, or `incomplete` statuses (including underscore-separated statuses). The guard also reports fully verified supporting-route and cross-cutting counts. Source commit `bfaafee985002414c23b77e541591eda3b43e2cf`.
- `docs/ux/all-module-browsing-manifest.json`: recorded source evidence; commit `3edb835b7b0914edf5f444040eeed842cbca089d`.
- **NOT RUN:** inventory guard, TypeScript, lint, unit tests, build, authenticated browser/accessibility, RLS/accounting regression. Baseline remains 21 sidebar modules, 132 authenticated routes (15 supporting), 11 cross-cutting workflows; 0/21 modules, 0/15 supporting routes and 0/12 batches fully verified. No `main` changes, manual CI, production DB changes or deployment.

### Cross-cutting identity normalization parity (2026-11-16)

- `scripts/check-browsing-coverage.mjs`: cross-cutting workflow names now use trimmed, collapsed-whitespace and case-folded identity comparison, preventing duplicate coverage records disguised by casing or tabs. Source commit `116b586f7d7c9965d43e07a1d0141420639422ab`.
- `docs/ux/all-module-browsing-manifest.json`: recorded source-only evidence in commit `f8d753b81e2fa6b679318bd77ab35abdce61b7ac`.
- **NOT RUN:** inventory guard, TypeScript, lint, unit tests, build, authenticated browser/accessibility, RLS/accounting regressions. Documented baseline 21 modules, 132 authenticated routes (15 supporting), 11 cross-cutting areas; 0/21 modules, 0/15 supporting routes, 0/12 batches fully verified. No changes to main, manual CI, production database or deployment.

### Sidebar whitespace normalization correction (2026-11-16)

- `scripts/check-browsing-coverage.mjs`: fixed the normalized sidebar label guard from matching literal `\\s` text to matching actual whitespace (`\s`), so labels differing by repeated spaces, tabs or newlines are treated as duplicates. Source commit `b29a78ee88b5b41fc7fca5458ca4ce2edc38f369`.
- `docs/ux/all-module-browsing-manifest.json`: updated inventory guard evidence; commit `8d83d4f2f38ccf3337ad2dfeae881033ca2d158b`.
- **SOURCE REVIEW ONLY; NOT RUN:** `check:browsing-coverage`, typecheck, lint, unit tests, build, authenticated browser/accessibility, RLS/accounting regressions. Baseline 21 sidebar modules, 132 authenticated route files (15 supporting), 11 cross-cutting areas; 0/21 modules, 0/15 supporting routes, 0/12 batches fully verified. No main branch changes, manually triggered CI, production DB operations or deployment.

### Normalized sidebar identity inventory guard (2026-11-16)

- `scripts/check-browsing-coverage.mjs`: normalize top-level sidebar labels by trimming, collapsing whitespace and case folding before uniqueness checks for both source navigation and manifest. This detects visually duplicate module names even if their destination paths differ. Source commit `0a428fe46feb3ba826972bc466c7a5a3839fda0c`.
- `docs/ux/all-module-browsing-manifest.json`: inventory guard evidence updated in commit `3aa08b22c59df56bb25ae76629207ac73c2d48ad`.
- **SOURCE REVIEW ONLY; NOT RUN:** inventory guard, TypeScript, lint, unit tests, build, authenticated browser/accessibility, RLS and accounting regression. Documented baseline remains 21 sidebar modules, 132 authenticated routes (15 supporting), 11 cross-cutting areas; 0/21 modules, 0/15 supporting routes and 0/12 batches fully verified. No changes to main, manually triggered CI, production database or deployment.

### Cross-cutting workflow identity guard (2026-11-16)

- `scripts/check-browsing-coverage.mjs`: compare trimmed cross-cutting workflow names for uniqueness, preventing whitespace-equivalent entries from bypassing the duplicate-name guard. Source commit `7cd6db1c13b48d5011b0c210ada9877b680f5e0f`.
- **SOURCE REVIEW ONLY; NOT RUN:** inventory guard, TypeScript, lint, unit tests, build, authenticated browser/accessibility, RLS and accounting regression. No acceptance criteria were marked complete. Documented baseline remains 21 sidebar modules, 132 authenticated route files (15 supporting), and 0/12 fully verified batches. No main changes, manually triggered CI, production database operations or deployment.

### Browsing inventory validation hardening (2026-11-15)

- `scripts/check-browsing-coverage.mjs`: trim acceptance-criterion identifiers before checking uniqueness, require `fullyVerified === true` for module evidence checks, and reject empty/nonstring `browsingImplementation` statuses. Commit `7a272e9904637fa3f443670566f562eaca02164b`.
- `docs/ux/all-module-browsing-manifest.json`: source evidence updated in commit `7f5ef7a97d2e7fc065ff573edc29fd149440d590`.
- **SOURCE REVIEW ONLY, NOT RUN:** inventory guard, TypeScript, lint, unit tests, build, authenticated browser/accessibility, RLS and accounting regressions. Baseline remains 21 sidebar modules, 132 authenticated route files (15 supporting); **0/21 modules, 0/15 supporting routes, 0/12 batches fully verified**. No `main` changes, manual CI, production database changes or deployment.

### Acceptance evidence integrity guard (2026-11-15)

- `scripts/check-browsing-coverage.mjs`: fully verified modules, supporting routes and cross-cutting workflows must provide 12 distinct nonempty acceptance evidence strings; source-only and placeholder/unexecuted evidence is rejected. Commits `a11bebd445720d3a25118328d1bc225cd3a335f6` and `6729e87a3190a3756fb1030f132d1d9140e6d094`.
- `docs/ux/all-module-browsing-manifest.json`: recorded this guard under cross-cutting evidence; commit `41c669f51c0326474016096bf86c427f77ce9adf`.
- **NOT RUN:** local inventory guard, typecheck, lint, Vitest, build, authenticated browser, accessibility, RLS and accounting regression. Inventory remains a documented baseline of 21 sidebar modules, 132 authenticated routes (15 supporting); 0/21 modules and 0/12 batches fully verified. No main changes, manual CI, production DB changes or deployment.

### Cross-cutting workflow verification-status inventory guard (2026-11-15)

- `scripts/check-browsing-coverage.mjs`: require an explicit boolean `fullyVerified` for each cross-cutting workflow rather than silently interpreting a missing flag as unverified; commit `205ea4e38049f9b6f8e0b715155d5102db225709`.
- `docs/ux/all-module-browsing-manifest.json`: 11 existing cross-cutting workflows explicitly set to `fullyVerified: false`; commit `93af3f75047f4d986228d0885865124221a91db2`.
- **SOURCE REVIEW ONLY; NOT RUN:** local inventory guard, TypeScript, lint, unit tests, build, authenticated browser/accessibility, security/RLS and accounting regression. Baseline remains 21 sidebar modules, 132 authenticated routes (15 supporting); **0/21 modules, 0/15 supporting routes, 0/12 batches fully verified**. No changes to `main`, manually triggered CI, production database or deployment.

### Banking invisible-control return-search parity (2026-11-15)

- `src/lib/banking/transaction-return.ts`: reject C1 controls, U+061C, U+200E/U+200F and U+2028/U+2029 in return-context search while preserving independent filters; commit `559664cec0286b057fc6cbbecd1f2eb5d515463e`.
- `src/lib/banking/transaction-return.test.ts`: seven codepoint regression cases for parser and URL decoder, plus multilingual preservation; commit `9a0b40686c7c9f06b2a42cbe8e1f0f6fdca53c69`. **WRITTEN, NOT RUN.**
- Manifest Banking evidence updated. **NOT RUN:** local `check:browsing-coverage`, typecheck, lint, Vitest, build, authenticated browser/accessibility, RLS/accounting regression. Baseline 21 sidebar modules, 132 authenticated routes (15 supporting); **0/21 modules, 0/15 supporting routes, 0/12 batches fully verified**. No main changes, manual CI, production database operations or deployment.

### Accounting journal normalized-search length boundary (2026-11-15)

- `src/lib/accounting/journal-browsing.ts`: enforce the 120-character limit on trimmed effective journal search text rather than padded URL input; commit `6ef3b57b043033d72cc4f67925daca1d8cfe984c`.
- `src/lib/accounting/journal-browsing.test.ts`: added 120/121-character padded-search boundary regressions; commit `3b64e467ed38f091f325727d3e2b97ce2d687a77`. **WRITTEN, NOT RUN.**
- Manifest Accounting evidence updated. **NOT RUN:** local `check:browsing-coverage`, TypeScript, lint, Vitest, build, authenticated browser/accessibility, RLS/accounting regression. Baseline 21 sidebar modules, 132 authenticated routes (15 supporting); **0/21 modules, 0/15 supporting routes, 0/12 batches fully verified**. No main changes, manual CI, production database operations or deployment.

### Accounting journal URL search whitespace normalization (2026-11-15)

- `src/lib/accounting/journal-browsing.ts`: ignore whitespace-only journal search deep links and trim surrounding whitespace, preserving independent filters and existing control-character validation; commit `456342ad6033d46b38991c91722fbfb3bb8ec816`.
- `src/lib/accounting/journal-browsing.test.ts`: added blank-only, padded and multilingual search cases; commit `64d74924e36baf0b96e7f2e8525643e0fdcfe821`. **WRITTEN, NOT RUN.**
- Coverage manifest evidence updated. **NOT RUN:** local `check:browsing-coverage`, typecheck, lint, Vitest, build, authenticated browser/accessibility, RLS/accounting regression. Baseline 21 sidebar modules, 132 authenticated routes (15 supporting); **0/21 modules, 0/15 supporting routes, 0/12 batches fully verified**. No changes to main, manual CI, production database or deployment.


### Accounting journal Unicode separator deep-link protection (2026-11-15)

- `src/lib/accounting/journal-browsing.ts`: reject U+2028 line and U+2029 paragraph separators in URL-restored journal search while retaining multilingual text; commit `7d18587be5e659b68ba2040294b17df362c5bc2e`.
- `src/lib/accounting/journal-browsing.test.ts`: added both Unicode separator regressions; commit `e341cd07b629f002ed87f619083d7a34dd796641`. **WRITTEN, NOT RUN.**
- **NOT RUN:** local `check:browsing-coverage`, TypeScript, lint, Vitest, build, authenticated browser/accessibility, RLS/accounting regression. Baseline 21 sidebar modules, 132 authenticated routes (15 supporting); **0/21 modules, 0/15 supporting routes, 0/12 batches fully verified**. No changes to main, manual CI, production database or deployment.

### Accounting journal C1 and directional-control search safety (2026-11-15)

- `src/lib/accounting/journal-browsing.ts`: reject C1 control range U+007F–U+009F and invisible direction marks U+061C/U+200E/U+200F in journal search URLs; source commit `631aba15ef3f92a9ed405d5e5007b66633419e79`.
- `src/lib/accounting/journal-browsing.test.ts`: regression cases for C1 and directional marks, commit `62b4193045c77fa37d2a78fd41311c2b355b32bd`. **WRITTEN, NOT RUN.**
- **NOT RUN:** local `check:browsing-coverage`, typecheck, lint, unit tests, build, authenticated browser/accessibility, RLS/accounting regression. Baseline 21 sidebar modules, 132 authenticated routes (15 supporting); **0/21 modules, 0/15 supporting routes, 0/12 batches fully verified**. No `main` changes, manual CI, production database change or deployment.

### Accounting journal actual control-character regression correction (2026-11-15)

- `src/lib/accounting/journal-browsing.test.ts`: corrected the test inputs to use actual JavaScript escaped newline, carriage return, tab, NUL, DEL, U+202E and U+2066 characters instead of literal backslash sequences. Commit `9a155248bfc75bf8e4ebe89bf0b0ee8917cbc22a`. **WRITTEN, NOT RUN.**
- `docs/ux/all-module-browsing-manifest.json`: Accounting partial evidence and remaining verification updated, commit `a31952b16af03d4426455f1ae2f2df4b172132d2`.
- **NOT RUN:** local `check:browsing-coverage`, TypeScript, lint, Vitest, build, authenticated browser/accessibility, RLS/accounting regression. Baseline 21 sidebar modules, 132 authenticated route files (15 supporting); **0/21 modules, 0/15 supporting routes, 0/12 batches fully verified**. No `main` changes, manual CI, production database changes or deployment.

### Accounting journal deep-link filter validation (2026-11-15)

- `src/lib/accounting/journal-browsing.ts`: reject noncanonical journal page/page-size strings, ASCII controls and bidi spoofing controls in journal search, and inverted date windows while retaining independent valid filters. Commit `1ce8ad4cb78dc2ae78a40f48424a0df2c08f7f47`.
- `src/lib/accounting/journal-browsing.test.ts`: malformed numeric filters, multilingual search and inverted/same-day date regressions. Commit `a9ea6ea2cea1d275f1e20abc75153979aabc6a8e`. **WRITTEN, NOT RUN.**
- **NOT RUN:** local browsing coverage guard, TypeScript, lint, Vitest, build, authenticated browser/accessibility, RLS/accounting regression. Baseline 21 sidebar modules, 132 authenticated routes (15 supporting); **0/21 modules, 0/15 supporting routes, 0/12 batches fully verified**. No main changes, manual CI, production database change or deployment.

### Banking return-search bidi spoofing protection (2026-11-15)

- `src/lib/banking/transaction-return.ts`: reject Unicode bidirectional formatting controls U+202A–U+202E and U+2066–U+2069 in restored search text; preserve legitimate multilingual searches. Commit `0db1dd22c4ad156925dd8545ee4b4f62cf5e5148`.
- `src/lib/banking/transaction-return.test.ts`: added bidi and multilingual regression cases; commit `d4f4e121f0e1530cccee504de08cf53fc24817c3`. **WRITTEN, NOT RUN.**
- **NOT RUN:** local browsing inventory guard, TypeScript, lint, unit tests, build, authenticated browser/accessibility, RLS/accounting regression. Baseline 21 sidebar modules, 132 authenticated routes (15 supporting); **0/21 modules, 0/15 supporting routes, 0/12 batches fully verified**. No main changes, manual CI, production database changes or deployment.

### Banking return-search actual control-character validation (2026-11-15)

- `src/lib/banking/transaction-return.ts`: repaired escaped literal regex and comment, so real ASCII controls are rejected; commit `8baa1f86e039df8831d48893f723fafc19ceb561`.
- `src/lib/banking/transaction-return.test.ts`: corrected inputs to exercise real newline, carriage return, tab, NUL and DEL rather than backslash-letter strings; commit `58b3db43bbb3425db1f252e7d1a854820f84f59d`. **WRITTEN, NOT RUN.**
- `docs/ux/all-module-browsing-manifest.json`: Banking evidence updated in commit `2818deb1c22d90421c6fef2263cbbae210bdcb64`.
- **SOURCE REVIEW ONLY; NOT RUN:** local coverage guard, TypeScript, lint, unit, build, authenticated browser/accessibility, RLS/accounting regression. Baseline 21 sidebar modules, 132 authenticated routes (15 supporting); **0/21 modules, 0/15 supporting routes, 0/12 batches fully verified**. No changes to main, manually triggered CI, production database or deployment.

### Banking return-search control-character safety (2026-11-14)

- `src/lib/banking/transaction-return.ts`: reject ASCII control characters in journal return-context search terms while retaining valid independent filters and normal Unicode search text. Source commit `8ad00b643a73c049c0548d0ee514461144f9d651`.
- `src/lib/banking/transaction-return.test.ts`: added control-character decoding and Unicode preservation regressions; commit `acc6012104af63d61f166ea90e27b195d57ee46e`. **WRITTEN, NOT RUN.**
- `docs/ux/all-module-browsing-manifest.json`: Banking evidence updated; commit `1298dd42c046672cfc49dfcfa37718f16fe8510b`.
- **SOURCE ONLY, NOT RUN:** local browsing inventory guard, TypeScript, lint, unit, build, authenticated browser/accessibility, security/RLS and accounting regression. Documented baseline: 21 sidebar modules, 132 authenticated routes (15 supporting); **0/21 modules, 0/15 supporting routes, 0/12 batches fully verified**. No main changes, manual CI, production database changes or deployment.

### Banking duplicate return-context parameter safety (2026-11-14)

- `src/lib/banking/transaction-return.ts`: duplicate query keys are now rejected individually rather than applying last-value-wins decoding, preserving independent valid filters. Source commit `a07f3161a1a54c2f191b4ba7c565798647fcec25`.
- `src/lib/banking/transaction-return.test.ts`: three regression scenarios cover conflicting, identical and date duplicate keys; commit `4cb2a5ab4cc9e08b2921131e1407b8f7b05c0897`. **WRITTEN, NOT RUN.**
- `docs/ux/all-module-browsing-manifest.json`: Banking partial evidence and remaining verification recorded in commit `da1832121a50fc96a5e6cb18354ddd39a68ae364`.
- **SOURCE ONLY; NOT RUN:** local `check:browsing-coverage`, TypeScript, lint, unit, build, authenticated browser/accessibility, security/RLS and accounting regression. Baseline remains 21 sidebar modules and 132 authenticated routes (15 supporting); **0/21 modules, 0/15 supporting routes, 0/12 batches fully verified**. No main changes, manual CI, production database changes or deployment.

### Payroll Reports zero-row export action consistency (2026-11-14)

- `src/screens/payroll/reports.tsx`: hide CSV and Print/PDF actions when a successful report has zero rows, matching the existing no-rows EmptyState and avoiding printing an empty report. Source commit `222e27bfbacc3e7cf92bbf2f19004d1fc4a92594`.
- `docs/ux/all-module-browsing-manifest.json`: Payroll partial source evidence and pending authenticated empty/nonempty export checks recorded in commit `b437e4b2cf295d471ffb3f2c3ec4acf1fb45567c`.
- **SOURCE ONLY; NOT RUN:** local `check:browsing-coverage`, TypeScript, lint, unit, build, authenticated browser/accessibility, RLS and accounting regression. Baseline remains 21 sidebar modules, 132 authenticated route files (15 supporting); **0/21 modules, 0/15 supporting routes, 0/12 batches fully verified**. No main changes, manual CI, production database changes or deployment.


### Payroll Reports unavailable-result recovery (2026-11-14)

- `src/screens/payroll/reports.tsx`: successful report responses without a usable result now show a descriptive empty state rather than a blank content area; source commit `ed73876159d059c83af6ce69517fefc16da86cfc`.
- `docs/ux/all-module-browsing-manifest.json`: Payroll partial source evidence and pending authenticated empty-state verification recorded in commit `f63a87ff5840e99ea9f1bb59a915d658544ba1b6`.
- **SOURCE ONLY; NOT RUN:** local `check:browsing-coverage`, TypeScript, lint, unit tests, build, authenticated browser/accessibility, role/RLS and accounting regression. Documented baseline: 21 sidebar modules, 132 authenticated route files (15 supporting); **0/21 modules, 0/15 supporting routes, 0/12 batches fully verified**. No changes to main, manual CI, production database or deployment.

### Payroll Reports precise invalid-field accessibility (2026-11-14)

- `src/screens/payroll/reports.tsx`: date validation now flags only the missing or chronologically offending start/end field via `aria-invalid`, preserving the existing alert association for the affected input. Source commit `fd3c5aedf7d5e8ed6001bf3a4d7b25e1c8c36869`.
- `docs/ux/all-module-browsing-manifest.json`: record partial Payroll evidence and outstanding screen-reader/keyboard verification; commit `40ce300e21a9b0512e6feb006d5be344adee4189`.
- **SOURCE ONLY; NOT RUN:** local `check:browsing-coverage`, TypeScript, lint, unit, build, authenticated browser/accessibility, security/RLS and accounting regression. Documented baseline 21 sidebar modules and 132 authenticated routes (15 supporting); **0/21 modules, 0/15 supporting routes, 0/12 batches fully verified**. No changes to main, manual CI, production database or deployment.

### Payroll Reports local-calendar date defaults (2026-11-14)

- `src/screens/payroll/reports.tsx`: initialize the reporting period from the user's local calendar date instead of UTC `toISOString()`, avoiding an incorrect default day around timezone boundaries. Code commit `02a4de883e4705b0fe4e972bcaa5bde1c13a817d`.
- `docs/ux/all-module-browsing-manifest.json`: record Payroll partial source evidence and pending timezone-boundary verification; commit `870937a67bdc1263b07d67e765d18e3a05a60f48`.
- **SOURCE ONLY; NOT RUN:** local `check:browsing-coverage`, TypeScript, lint, unit, build, authenticated browser/accessibility, security/RLS and accounting regression. Baseline remains 21 sidebar modules and 132 authenticated route files (15 supporting); **0/21 modules, 0/15 supporting routes, 0/12 batches fully verified**. No main changes, manual CI, production database change or deployment.

### Payroll Reports refetch display safety (2026-11-14)

- `src/screens/payroll/reports.tsx`: while the current report query is fetching, show the loading state instead of the previous report table, preventing stale on-screen results during filter/report transitions. Source commit `9699586683f3279826225b788a3d03846de4078f`.
- `docs/ux/all-module-browsing-manifest.json`: Payroll partial source evidence and remaining authenticated refetch/error verification recorded in commit `8c9b0ef4b2be4020689eb68767ad26a42840b5d8`.
- **SOURCE ONLY; NOT RUN:** local `check:browsing-coverage`, TypeScript, lint, unit, build, authenticated browser/accessibility, security/RLS and accounting regression. Baseline 21 sidebar modules, 132 authenticated route files (15 supporting); **0/21 modules, 0/15 supporting routes, 0/12 batches fully verified**. No changes to main, manual CI, production database or deployment.

### Payroll Reports successful-query export gate (2026-11-14)

- `src/screens/payroll/reports.tsx`: CSV and Print/PDF actions now require a successful current report query as well as valid dates and no in-flight fetch. CSV handler independently checks success. Source commit `b0e85d5c7567bfdd0eb7f3effa81ac2ea33ed6ad`.
- `docs/ux/all-module-browsing-manifest.json`: Payroll evidence and pending error/refetch verification updated in commit `6fd7f4ecb7b66fe60715631cb31f0813c294e234`.
- **SOURCE ONLY; NOT RUN:** local `check:browsing-coverage`, TypeScript, lint, unit, build, authenticated browser/accessibility, security/RLS and accounting regression. Baseline 21 sidebar modules, 132 authenticated route files (15 supporting); **0/21 modules, 0/15 supporting routes, 0/12 batches fully verified**. No main changes, manual CI, production database changes or deployment.

### Payroll Reports stale-export guard (2026-11-14)

- `src/screens/payroll/reports.tsx`: suppress CSV and Print/PDF actions while reporting dates are invalid or the report query is fetching; `exportCsv` also guards against stale exports during these states. Code commit `9916bfd5a9f77e670153027aecc9e919c373ab20`.
- `docs/ux/all-module-browsing-manifest.json`: Payroll evidence and pending authenticated export/refetch verification recorded in commit `0fad1c5e846909e24e21d5f162ba917de13b0e03`.
- **SOURCE ONLY, NOT RUN:** local `check:browsing-coverage`, TypeScript, lint, unit, build, authenticated browser/accessibility, role/RLS and accounting regression. Baseline remains 21 sidebar modules, 132 authenticated routes (15 supporting); **0/21 modules, 0/15 supporting routes, 0/12 batches fully verified**. No `main` changes, manual CI, production database changes or deployment.


### Payroll Reports invalid-date accessibility association (2026-11-14)

- `src/screens/payroll/reports.tsx`: associate invalid reporting-period date inputs with the visible alert using `aria-invalid`, `aria-describedby`, and a stable alert ID. Code commit `7d2901b03860a71dd847d2b0913f50be71e32d15`.
- `docs/ux/all-module-browsing-manifest.json`: Payroll evidence and screen-reader/keyboard verification gap updated in commit `c37e83e8cc3e8af1e789f3b441eee67a407bb3a8`.
- **SOURCE ONLY; NOT RUN:** local `check:browsing-coverage`, TypeScript, lint, unit, build, authenticated browser, accessibility, permissions/RLS and accounting regression. Baseline remains 21 sidebar modules, 132 authenticated routes (15 supporting); **0/21 modules, 0/15 supporting routes, 0/12 batches fully verified**. No `main` changes, manual CI, production database changes or deployment.

### Payroll Reports invalid-period query guard (2026-11-14)

- `src/screens/payroll/reports.tsx`: suppress report execution when either date is empty or the start date exceeds the end date, and show an accessible explanatory alert. Source commits `27263616b7e2aba1f826090ca1e78ff513543fca` and `464571cd7e05524d0ff9d423ec3f34b1318e6d5d`.
- `docs/ux/all-module-browsing-manifest.json`: record partial source evidence and pending date-validation verification, commit `b11705ebcde4afb0a24ae09b09a4981a1cd6b2a8`.
- **NOT RUN:** local `check:browsing-coverage`, typecheck, lint, unit, build, authenticated browser, accessibility, role/RLS and accounting regression. Baseline 21 sidebar modules, 132 authenticated route files (15 supporting); **0/21 modules, 0/15 supporting routes, 0/12 batches fully verified**. No main changes, manually triggered CI, production database changes or deployment.

### Payroll Reports catalog-error JSX correction (2026-11-14)

- `src/screens/payroll/reports.tsx`: repaired invalid JSX in catalog-error return by wrapping persistent Payroll navigation and retryable ErrorState in a fragment; source commit `50cf2ed7876763a745d1ddf8c558683ab1cda2d5`.
- `docs/ux/all-module-browsing-manifest.json`: recorded evidence and pending verification; commit `8a54578aa2112836599dc3cf56a89d656c183274`.
- **SOURCE REVIEW ONLY; NOT RUN:** local `check:browsing-coverage`, typecheck, lint, unit tests, build, authenticated browser, accessibility, RLS and accounting regression. Baseline remains 21 sidebar modules, 132 authenticated routes (15 supporting); **0/21 modules, 0/15 supporting routes, 0/12 batches fully verified**. No changes to main, manually triggered CI, production database or deployment.

### Payroll Reports navigation during loading and errors (2026-11-13)

- `src/screens/payroll/reports.tsx`: keep Payroll Reports page header and PayrollSubnav visible during company loading/missing company, denied `payroll.reports.view`, catalog loading and catalog error. Existing report execution, exports, query gates and retry behavior remain unchanged. Source commit `65f1768ddf73394ee2038dad2803ef3c3fa97e84`.
- `docs/ux/all-module-browsing-manifest.json`: source evidence and pending authenticated navigation checks updated in commit `0a2b511f21abc3e7bfbd3df62a79564da6333ddf`.
- **SOURCE ONLY, NOT RUN:** local `check:browsing-coverage`, typecheck, lint, unit, build, authenticated browser, accessibility, RLS and accounting regressions. Baseline remains 21 sidebar modules, 132 authenticated route files (15 supporting); **0/21 modules, 0/15 supporting routes, 0/12 batches fully verified**. No main changes, manual CI, production database changes or deployment.

### Payroll Runs navigation during loading, company selection and errors (2026-11-13)

- `src/screens/payroll/runs.tsx`: preserve the Payroll Runs page header and PayrollSubnav during company loading/missing company, denied `payroll.view`, payroll settings/list loading, and settings/list query failures. Retry handlers and permission gates remain intact. Source commit `6dbb46a7770cae6c7bd7950acac98251c4318a63`.
- `docs/ux/all-module-browsing-manifest.json`: Payroll source evidence and authenticated state-verification gap recorded; commit `90c71d792e32cab78a3c4219d78348160f8782b0`.
- **SOURCE ONLY, NOT RUN:** local `check:browsing-coverage`, typecheck, lint, unit, build, authenticated browser, accessibility, RLS and accounting regression. Baseline remains 21 sidebar modules, 132 authenticated route files (15 supporting); **0/21 modules, 0/15 supporting routes, 0/12 batches fully verified**. No main changes, manual CI, production database changes or deployment.

### Payroll Runs contextual return navigation (2026-11-13)

- `src/routes/_authenticated/payroll/runs.$runId.tsx`: allowlisted and bounded returnStatus, returnQ and returnSort query context (commit `8b448ab309c1f1f84c7b9e79fff91a4ee7dc4143`).
- `src/screens/payroll/run-detail.tsx`: All runs links in normal/loading/error/permission states restore the originating list filters and sort; detail tab changes and restricted-tab recovery retain context (commit `1ce735a01eb989a9d58c23ffdc86d6207a12d7cb`).
- `src/screens/payroll/runs.tsx`: existing-run and newly-created-run navigation carry the originating list context (commit `0aa684332009760c53b4d7121406c9db689ed166`).
- **SOURCE ONLY, NOT RUN:** local coverage guard, TypeScript, lint, unit, build, authenticated browser Back/Forward/deep-link/refresh, accessibility, payroll RLS/accounting regression. Baseline 21 sidebar modules, 132 authenticated routes (15 supporting); **0/21 modules, 0/15 supporting routes, 0/12 batches fully verified**. No main changes, manual CI, production database changes or deployment.


### Restricted Payroll journal deep-link recovery (2026-11-13)

- `src/screens/payroll/run-detail.tsx`: unauthorized `?tab=journals` deep links now display a native **Return to employees** link targeting the same run and an allowed tab. The journal query remains gated by `accounting.view`; no payroll or accounting mutations changed. Source commit `ba60dd042b2f7a6fe6a50f94beb3d3eb8d9b4492`.
- `docs/ux/all-module-browsing-manifest.json`: source evidence and restricted-role browser verification gap updated in commit `62fa68aba401a3582135744062bea2c9a2249cea`.
- **SOURCE ONLY, NOT RUN:** local browsing coverage guard, TypeScript, lint, unit tests, build, authenticated browser/keyboard/accessibility, permissions/RLS and accounting regression. Baseline **21 sidebar modules, 132 authenticated route files (15 supporting)**; **0/21 modules, 0/15 supporting routes, 0/12 batches fully verified**. No `main` changes, manual CI, production database changes or deployment.


### Payroll navigation shell for company and permission states (2026-11-13)

- `src/screens/payroll/run-detail.tsx`: retain Payroll subnavigation and native **All runs** return link during company selection loading, missing company, and denied `payroll.view` permission. Existing permission checks and payroll accounting mutations remain unchanged. Source commit `0e6c01d7b3c78da30583a9c228deb8cdfdf13c39`.
- Manifest source evidence updated in commit `688b24e61e6b0f5dbdda7be83c3c47cba359d24e`.
- **SOURCE ONLY; NOT RUN:** local browsing coverage guard, typecheck, lint, unit tests, build, authenticated browser/accessibility, role/RLS and accounting regressions. Documented baseline: 21 sidebar modules, 132 authenticated routes (15 supporting). **0/21 modules, 0/15 supporting routes, 0/12 batches fully verified.** No main changes, manually triggered CI, production database changes or deployment.


### Payroll journal navigation callback permission guard (2026-11-13)

- `src/screens/payroll/run-detail.tsx`: the tab-change callback now refuses navigation to `journals` without `accounting.view`, complementing the disabled tab and permission-gated query; source commit `b8645067d7b4c8fa75b6b8f3416f61193868a5d4`.
- Coverage manifest evidence updated in commit `8fea2fb56bebd3b1681586194e130a52a12fa189`.
- **SOURCE ONLY; NOT RUN:** local coverage guard, typecheck, lint, unit, build, authenticated restricted-role browser, accessibility, security/RLS and accounting regressions. Documented baseline: 21 sidebar modules, 132 authenticated route files (15 supporting). **0/21 modules, 0/15 supporting routes, 0/12 batches fully verified.** No main changes, manual CI, production database changes or deployment.


### Payroll journal-tab permission-aware navigation (2026-11-13)

- `src/screens/payroll/run-detail.tsx`: disable the Journal entries tab when `accounting.view` is absent; a directly loaded `?tab=journals` URL continues to show an explicit access-required state without fetching journals. Code commit `0fc4a2f1411fc63a227ee54b034ca9f9a80caf50`.
- `docs/ux/all-module-browsing-manifest.json`: Payroll source evidence and remaining restricted-role keyboard/deep-link verification updated; commit `b1445e286da692ed0010d25cc85217f0975839a2`.
- **SOURCE ONLY, NOT RUN:** local browsing guard, TypeScript, lint, unit, build, authenticated browser, accessibility, security/RLS and accounting regression. Baseline 21 sidebar modules, 132 authenticated route files (15 supporting); **0/21 modules, 0/15 supporting routes, 0/12 batches fully verified**. No changes to `main`, manual CI, production database or deployment.


### Payroll run-detail navigation during loading and errors (2026-11-13)

- `src/screens/payroll/run-detail.tsx`: retain Payroll subnavigation and a native **All runs** return link while run detail data is loading or has failed; retry remains available. Source commit `d7946c0d4c736b06c7bbcda296bbe4379feecb70`.
- `docs/ux/all-module-browsing-manifest.json`: Payroll partial evidence and pending authenticated loading/error navigation checks updated; commit `4e7ceeb630d1746fac5e9379152559a660895b94`.
- **SOURCE ONLY, NOT RUN:** coverage inventory guard, TypeScript, lint, unit, build, authenticated browser, accessibility, permissions/RLS, accounting regression. Baseline **21 sidebar modules, 132 authenticated route files (15 supporting)**; **0/21 modules, 0/15 supporting routes, 0/12 batches fully verified**. No `main` changes, manual CI, production database changes or deployment.


### Payroll run-detail URL-backed tabs (2026-11-13)

- `src/routes/_authenticated/payroll/runs.$runId.tsx`: validate detail tab to `employees`, `journals`, or `payments`; commit `5d87318737c19686c9f1783091ea624499a7fbff`.
- `src/screens/payroll/run-detail.tsx`: replace ephemeral tab state with native URL navigation for Back/Forward, deep links and refresh; commit `2d3e0bf24ca9bcb1638dd12e831bfe8a76f3c85d`. Journal data loading remains permission-gated.
- **SOURCE ONLY, NOT RUN:** local `check:browsing-coverage`, TypeScript, lint, unit, build, authenticated browser, accessibility, payroll RLS/accounting regressions. Baseline 21 sidebar modules, 132 authenticated routes (15 supporting); **0/21 modules, 0/15 supporting routes, 0/12 batches fully verified**. No main changes, manual CI, production database changes or deployment.

### Payroll Runs browser history correction (2026-11-13)

- `src/screens/payroll/runs.tsx`: status, sort and clear-filter navigation now push history entries so Back/Forward can restore prior selections; search keystrokes continue replacing history to avoid excessive entries. Source commit `9847bd3a355ef8c55cae7eb0afbd1580454d592c`.
- Coverage manifest updated in commit `296cb9de4377963e48c42f4a1f52357514f7b8de`. **SOURCE ONLY, NOT RUN:** local coverage guard, typecheck, lint, unit, build, authenticated browser, accessibility, RLS and payroll/accounting regression. Baseline 21 modules, 132 authenticated routes (15 supporting); **0/21 modules, 0/15 supporting routes, 0/12 batches verified**. No main changes, manual CI, production database changes or deployment.


### Payroll runs URL-backed list state (2026-11-13)

- `src/routes/_authenticated/payroll/runs.index.tsx`: validate allowlisted status, search term and sort in route search; commit `a8d51491862ca32e1e59d1577cde4130cb53c1e0`.
- `src/screens/payroll/runs.tsx`: replace ephemeral list filters with native URL-backed state, retaining deep-link/refresh and navigable list context; commit `e1aa93cc72ec729562bc35843458d45d4b91d5d7`.
- **Source changes only, NOT RUN:** local coverage guard, TypeScript, lint, unit, build, authenticated browser, accessibility, payroll permissions/RLS and accounting regressions. No deployment, production database changes, manual CI or main branch changes. Baseline inventory remains 21 sidebar modules, 132 authenticated routes (15 supporting); **0/21 modules, 0/15 supporting routes, 0/12 batches fully verified**.


### Banking canonical return page values (2026-11-13)

- `src/lib/banking/transaction-return.ts`: reject padded and noncanonical decimal page strings (such as `002`, `01`, whitespace and exponent forms) while retaining canonical zero and positive integer pages and unrelated filters. Code commit `94cf4b6d4951731776850aad0a9f6d3e985d5c7d`.
- `src/lib/banking/transaction-return.test.ts`: added regression cases for malformed and valid page strings and decoded return contexts. Test commit `97cc65b8f70bfeae565841127dfefb53e47d6be1`. **WRITTEN, NOT RUN**.
- **Partial Banking source evidence only.** Baseline inventory remains 21 sidebar modules, 132 authenticated route files (15 supporting); **0/21 modules, 0/15 supporting routes, 0/12 batches fully verified**. Local browsing guard, unit, typecheck, lint, build, authenticated browser, accessibility, RLS and accounting regressions **NOT RUN**. No main changes, manual CI, production database changes or deployment.


### Banking return-context canonical page sizes (2026-11-12)

- `src/lib/banking/transaction-return.ts`: only canonical page-size numbers or exact decimal strings (25, 50, 100, 200) survive deep-link return context. Reject padded, whitespace, hexadecimal and exponent variants without discarding valid unrelated filters. Commit `caa3252be5c0a1cb72fa76e765e47786bb712d83`.
- `src/lib/banking/transaction-return.test.ts`: regression cases added for malformed and valid page sizes. Commit `8816f43bc2d9b048832369399f09c1b36f4f2a3f`. **WRITTEN, NOT RUN**.
- Partial Banking source evidence only. Baseline **21 sidebar modules, 132 authenticated routes (15 supporting)**; **0/21 modules, 0/15 supporting routes, 0/12 batches fully verified**. Local coverage guard, unit suite, TypeScript, lint, build, authenticated browser, accessibility, RLS and accounting regression **NOT RUN**. No main changes, manual CI, production database changes or deployment.


### Banking early-year date validation correction (2026-11-12)

- `src/lib/banking/transaction-return.ts`: use `setUTCFullYear` rather than `Date.UTC(year, ...)` to prevent JavaScript's special 1900 offset for years 0000–0099 from rejecting otherwise valid dates. Commit `e841554843d40cfeeaae375c0319b40d490e1564`.
- `src/lib/banking/transaction-return.test.ts`: added leap-year and century-boundary cases. Commit `440dd8c1b0051a21d46d2e2ef83044276bbbd2b6`. **WRITTEN, NOT RUN**.
- Partial Banking source evidence only. **0/21 modules, 0/15 supporting routes, 0/12 batches verified.** Baseline 132 authenticated route files; guard, typecheck, lint, unit, build, authenticated browser, accessibility, RLS and accounting checks **NOT RUN**. No main changes, CI trigger, production database changes or deployment.


### Banking inverted return-date range protection (2026-11-12)

- `src/lib/banking/transaction-return.ts`: when both dates are individually valid but `dateFrom` exceeds `dateTo`, discard the conflicting end date while retaining the start date and unrelated allowlisted filters. Source commits `20867f773f4185e74f3541aa18c1488aa15e3631` and `fdf36e81fc9e092d4ec9fedb8f79b7109307d182`.
- `src/lib/banking/transaction-return.test.ts`: added inverted-range encode/decode and same-day regressions, commit `d04269840e2e59671254dd9870353eb0546812de`. **WRITTEN, NOT RUN**.
- **Partial Banking source evidence only.** Local inventory guard, TypeScript, lint, unit, build, authenticated browser, accessibility, RLS and accounting regressions **NOT RUN**. Documented baseline 21 sidebar modules, 132 authenticated routes including 15 supporting; **0/21 modules, 0/15 supporting routes, 0/12 batches fully verified**. No main changes, manually triggered CI, production database changes or deployment.


### Banking return-filter calendar validity (2026-11-12)

- `src/lib/banking/transaction-return.ts`: banking journal return context now rejects impossible calendar dates while preserving other allowlisted filters; code commit `6fe3d4736d20d751a27536d05c98fbdbd8db53e7`.
- `src/lib/banking/transaction-return.test.ts`: regression for invalid dates, leap day and valid remaining filters; test commit `88c76798980a62f2f87f509f7fb6f5982d1857f8`. **WRITTEN, NOT RUN**.
- Banking remains **partially implemented, NOT fully verified**. Inventory baseline 21 sidebar modules, 132 authenticated route files, 15 supporting routes; **0/21 modules, 0/15 supporting routes, 0/12 batches fully verified**. Local inventory guard, typecheck, lint, unit, build, browser, accessibility, RLS and accounting regression **NOT RUN**. No main changes, GitHub Actions, production database changes or deployment.


### Acceptance-evidence placeholder regex correction (2026-11-12)

- `scripts/check-browsing-coverage.mjs`: fixed escaped `\\b` tokens in the acceptance-evidence regex so JavaScript uses actual word boundaries and rejects placeholder evidence for modules, supporting routes and cross-cutting workflows marked `fullyVerified`. Code commit `4a51f36bf707fdd00dabc5fa220f10a6ad3e7569`; manifest evidence commit `f497cefc8853f6f8175d6731ef35487b7e179888`.
- **Code committed; local tests and inventory guard NOT RUN.** This is a documentation-integrity correction, not functional browsing acceptance. Baseline 21 sidebar modules, 132 authenticated routes, 15 supporting; **0/21 modules, 0/15 supporting routes, 0/12 batches fully verified**. TypeScript, lint, build, browser, accessibility, RLS and accounting checks NOT RUN. No main changes, manual CI, production database changes or deployment.


### Verified-evidence placeholder protection (2026-11-12)

- `scripts/check-browsing-coverage.mjs`: all 12 acceptance-evidence entries for any fully verified module, supporting route or cross-cutting workflow must be nonempty and cannot contain `NOT RUN`, `PENDING`, `TODO`, `TBD`, `UNVERIFIED`, `NOT VERIFIED` or `NOT TESTED`. Source commit `0022999d1699c2a30b02a6cd7f895735274cb3da`.
- **Code committed, local guard and tests NOT RUN.** This only rejects obvious placeholder claims; it does not authenticate evidence or establish runtime acceptance. Documented baseline: 21 sidebar modules, 132 authenticated routes, 15 supporting; **0/21 modules, 0/15 supporting routes, 0/12 batches verified**. No main changes, GitHub Actions, production database changes or deployment.


**This is the master coverage scope, not an assertion of implementation completion.**  
**Authoritative repository:** `linkbusinessadvisory/LinkBooks`  
**ChatGPT-only development branch:** `feature/chatgpt-premium-browsing-20261107`  
**Source audited:** `src/lib/nav.ts` and the authenticated route tree at `8935c7bd180d94d8539f75460f8542dffd648b5b`.


### Settings Centre malformed-trail opening safety (2026-11-11)

- `src/lib/settings/panels.ts`: `openSettingsPanel` now removes entries equal to the active panel from a malformed incoming trail, preventing cyclic navigation state from persisting when opening a child or reopening the current panel. Commit `7bba8e459a3757e9af3dd01e3996f077e2e1adaa`.
- `src/lib/settings/panels.test.ts`: regression added for child opening, close-to-parent and same-panel normalization; commit `15661c2eb08f07a5661753294a298d73fc5adf67`. **WRITTEN, NOT RUN.**
- **Partial source evidence only:** 21 sidebar modules, 132 authenticated route files and 15 supporting routes remain baseline inventory. Local inventory guard, typecheck, lint, unit, build, browser, accessibility, RLS and accounting checks **NOT RUN**. **0/21 modules, 0/15 supporting routes, 0/12 batches verified.** No main merge, CI trigger, database change or deployment.

### Settings Centre malformed-trail self-return safety (2026-11-11)

- `src/lib/settings/panels.ts`: closing a panel excludes any malformed trail entries equal to the active panel, preventing a deep link from returning to itself. Source commit `03c0fe7d5c0a93bb5e0558b434890ade0a06291f`.
- `src/lib/settings/panels.test.ts`: regression for self-referential trails with and without a valid parent; commit `aaa976bf74e37653e569d68f4dddf721b386b0bd`. **WRITTEN, NOT RUN.**
- **Partial evidence only:** baseline 21 sidebar modules, 132 authenticated route files, 15 supporting routes. Local `check:browsing-coverage`, TypeScript, lint, unit, build, authenticated browser, accessibility, RLS and accounting checks **NOT RUN**. **0/21 modules, 0/15 supporting routes, 0/12 batches fully verified.** No main changes, CI trigger, production database changes or deployment.

### Settings Centre orphaned-trail opening safety (2026-11-11)

- `src/lib/settings/panels.ts`: opening a Settings panel from a URL with a missing or invalid active panel now discards orphaned `settingsTrail` history instead of carrying stale parent state into the newly opened panel. Existing valid nested navigation remains intact. Source commits `a73fea4f3339c54fde32e26079c49fb3fd0b526c`, `57ac43d520f5b105772554f4f508f5eaa848682e`.
- `src/lib/settings/panels.test.ts`: regression coverage for orphaned history, invalid current panel, valid nested return and reopening the current panel; commit `a6279104cb16a4cf00d72d2c2573412358228a7e`. **WRITTEN, NOT RUN.**
- **Partial source evidence only:** 21 sidebar modules, 132 authenticated route files and 15 supporting routes remain documented baseline counts. Local `check:browsing-coverage`, TypeScript, lint, build, unit, browser, accessibility, RLS and accounting tests **NOT RUN**. **0/21 modules, 0/15 supporting routes and 0/12 batches fully verified.** No main changes, CI trigger, database change or deployment.

### Settings Centre stale nested-panel return safety (2026-11-11)

- `src/lib/settings/panels.ts`: closing an absent or untrusted current panel now removes stale `settingsPanel` and `settingsTrail` query state instead of resurrecting a previous panel; unrelated filters remain unchanged. Source commit `2da207915047859ab9936e8266ef61ba75274611`.
- `src/lib/settings/panels.test.ts`: new regression case checks missing/invalid panel cleanup and valid nested return; test commit `a6faffc99c4d0cbab447370e01fcc3fdf39b5301`. **WRITTEN, NOT RUN.**
- **Partial source evidence only:** 21 sidebar modules and 132 authenticated route files (15 supporting) remain the documented inventory baseline, not freshly counted. `check:browsing-coverage`, typecheck, lint, build, unit, authenticated browser, accessibility, RLS and accounting checks **NOT RUN**. **0/21 modules, 0/15 supporting routes, 0/12 batches fully verified.** No `main` changes, CI trigger, production database changes or deployment.

### Settings Centre refreshable URL trail sanitation (2026-11-11)

- `src/lib/settings/panels.ts`: URL search validation now removes current-panel self-references from a supplied Settings navigation trail (commit `02ea38eb469bded1b856395229dc8c86003ccfe5`).
- `src/lib/settings/panels.test.ts`: regression for mixed and self-only trails (commit `a022701f4677d4b782dba24919ff84c6d56540e8`). **WRITTEN, NOT RUN**.
- Partial source evidence only. Baseline: 21 modules, 132 authenticated routes, 15 supporting. **0/21 modules, 0/15 supporting routes, 0/12 batches verified**. TypeScript, lint, unit, build, browser, accessibility, RLS, accounting and `check:browsing-coverage` **NOT RUN**. No CI, main merge, database change or deployment.

### Settings Centre repeated-ancestor URL safety (2026-11-11)

- `src/lib/settings/panels.ts`: repeated ancestor identifiers in malformed Settings URL trails are deduplicated, retaining the last occurrence before opening, closing or validating a panel. Source commit `d36f437b5ae1c42da4b64d7f750268993cb061fa`.
- `src/lib/settings/panels.test.ts`: added duplicate-ancestor refresh/open/close regression, commit `fd148c5e2fa4c21d4bc3d125a1a163a1b3cef0b9`. **WRITTEN, NOT RUN**.
- **Partial source evidence only.** Baseline 21 sidebar modules, 132 authenticated route files (15 supporting); **0/21 modules, 0/15 supporting routes, 0/12 batches fully verified**. `check:browsing-coverage`, TypeScript, lint, unit, build, authenticated browser, accessibility, security/RLS and accounting regressions **NOT RUN**. No main merge, GitHub CI trigger, production database change or deployment.

### Application-wide route inventory guard hardening (2026-11-11)

- `scripts/check-browsing-coverage.mjs` now rejects module entries with empty route lists, invalid route names or duplicate paths within the same module, and rejects malformed supporting route lists. Source commit `72c1aceb7b792f78c86bd5354625deda8b825fdd`.
- `docs/ux/all-module-browsing-manifest.json` records this inventory guard evidence (commit `02f0b1e41ebde9b0c0446b362b81829b01944048`). This is **future-module inventory protection**, not proof of functional completeness.
- **NOT RUN:** local `npm run check:browsing-coverage`, TypeScript, lint, unit, build, authenticated browser, accessibility, security/RLS and accounting regressions. Documented baseline remains **21 sidebar modules, 132 authenticated routes, 15 supporting routes**; **0/21 modules, 0/15 supporting routes, 0/12 batches fully verified**. No main changes, CI trigger, database change or deployment.

### Application-wide inventory destination/path safety (2026-11-11)

- `scripts/check-browsing-coverage.mjs`: added checks for duplicate sidebar destinations, malformed sidebar URLs, and invalid/traversal/absolute authenticated route inventory paths. Source commit `64eeaa134b708ea6331b99ec87e9fe6bee3ac30a`.
- `docs/ux/all-module-browsing-manifest.json`: inventory evidence updated, commit `2e17c6d60f1721a35fa07e931932b49edece04c7`.
- **Source-level inventory protection only; NOT RUN:** local guard, TypeScript, lint, unit, build, browser, accessibility, role/RLS and accounting checks. Baseline 21 sidebar modules, 132 authenticated routes, 15 supporting routes; **0/21 modules, 0/15 supporting routes, 0/12 batches fully verified**. No main changes, manual CI, production database changes or deployment.

### Canonical route path guard (2026-11-12)

- `scripts/check-browsing-coverage.mjs`: reject empty/dot route segments and unsupported characters in module and supporting route paths, including query/fragment suffixes.
- **Source-level only.** Local guard, TypeScript, lint, unit, build, authenticated browser, accessibility, security/RLS and accounting checks **NOT RUN**. Baseline: 21 modules, 132 authenticated routes, 15 supporting. **0/12 batches verified.** No main changes, CI trigger, database changes or deployment.


### Canonical route guard regex correction (2026-11-12)

- `scripts/check-browsing-coverage.mjs`: corrected over-escaped `.ts`/`.tsx` extension regex and backslash rejection in `isCanonicalRoutePath`. The previous extension regex could reject legitimate route filenames. Code commit `fd0f55e6656dd762ffce21939a5faa6e40a0b637`.
- **Source-level correction only.** Inventory guard, TypeScript, lint, unit, build, authenticated browser, accessibility, RLS and accounting checks **NOT RUN**. Documented baseline 21 sidebar modules, 132 authenticated routes, 15 supporting routes; **0/21 modules, 0/15 supporting routes, 0/12 batches verified**. No `main` changes, CI trigger, database change or deployment.

### Executable canonical route-path regression coverage (2026-11-12)

- `scripts/lib/browsing-route-path.mjs`: extracted `isCanonicalRoutePath` from the inventory guard without changing intended validation semantics (commit `93e2b46a02b0de97d34ba60a4a8a19f9b8b44595`).
- `scripts/check-browsing-coverage.mjs`: imports the shared validator (commit `500dae50b06c22873dca7a911aca89b333acc0f8`).
- `scripts/browsing-route-path.test.mjs`: new executable `node:test` cases for valid .ts/.tsx nested paths and invalid absolute, traversal, empty-segment, Windows backslash, query/fragment, unsupported extension and nonstring paths (commit `9758c02cd1bc5be0be527b920341bdcf5c2dc22c`). Run locally: `node --test scripts/browsing-route-path.test.mjs` and `npm run check:browsing-coverage`. **Both NOT RUN.**
- Source evidence only. Baseline 21 sidebar modules, 132 authenticated routes and 15 supporting routes; **0/21 modules, 0/15 supporting routes, 0/12 batches fully verified**. Typecheck, lint, build, unit suite, authenticated browser, accessibility, security/RLS and accounting regression **NOT RUN**. No `main` changes, manual GitHub Actions, database changes or deployment.

### Shared route validator consolidation (2026-11-12)

- `scripts/check-browsing-coverage.mjs`: removed two overlapping legacy path regular expressions and the duplicate validation loop. Module and supporting-route entries now use the same `isCanonicalRoutePath` predicate. Commit `a7daacb3b2fa80712fbc9f0125396c540bb937f7`.
- `scripts/lib/browsing-route-path.mjs`: rejects intermediate directory segments ending in `.ts` or `.tsx`, preventing a file-shaped segment from being treated as a directory. Commit `6e670088afd1dfbb23f6c89896f64d22ac5a51c5`.
- `scripts/browsing-route-path.test.mjs`: expanded edge-case tests for payroll, reports, Advisors portal, malformed separators, query/hash suffixes and file-shaped directories. Commit `dae6d6caa430049076dfcd55cfa9c35d345803a0`. **WRITTEN, NOT RUN**.
- **Scope:** structural inventory validation only, not browsing acceptance. Documented baseline remains 21 sidebar modules, 132 authenticated route files, 15 supporting routes; **0/21 modules, 0/15 supporting routes and 0/12 batches fully verified**. Local `node --test scripts/browsing-route-path.test.mjs`, `npm run check:browsing-coverage`, TypeScript, lint, build, browser, accessibility, RLS and accounting checks **NOT RUN**. No `main` changes, GitHub Actions, production database changes or deployment.

### Platform/Superadmin active navigation route-boundary fix (2026-11-12)

- `src/routes/_authenticated/platform.tsx`: Operations and Automation active states now match their exact route or a slash-delimited child route, not unrelated path prefixes (commit `13c85f124a85adba217701401f5a1efbc7ce83a5`). This preserves native links and existing permission gates; source-level fix only.
- `docs/ux/all-module-browsing-manifest.json`: platform supporting-route and cross-cutting evidence updated. **NOT RUN:** TypeScript, lint, unit, build, authenticated browser Back/Forward/deep-link/refresh, accessibility, role/RLS, accounting regression and `check:browsing-coverage`.
- **Coverage:** documented baseline 21 sidebar modules, 132 authenticated route files including 15 supporting; 0/21 modules, 0/15 supporting routes, **0/12 fully verified batches**. No GitHub Actions, main merge, production database changes or deployment.

### Platform/Superadmin selected-workspace visual state (2026-11-12)

- `src/routes/_authenticated/platform.tsx`: Operations and Automation links now apply the same visible active background and font weight as other Platform navigation entries, using the already boundary-safe route selectors; native links, route destinations and permission checks unchanged. Code commit `e0d58d088e87b76d52316cb8adabf2f0d4f83486`.
- `docs/ux/all-module-browsing-manifest.json`: platform supporting-route and cross-cutting evidence updated. **Source review only; NOT RUN:** local coverage guard, TypeScript, lint, unit, build, authenticated browser Back/Forward/deep-link/refresh, keyboard/screen reader, RLS and accounting regressions.
- Documented baseline: **21 sidebar modules, 132 authenticated route files including 15 supporting**. **0/21 modules, 0/15 supporting routes, 0/12 batches fully verified.** No changes to main, GitHub Actions, production database or deployment.

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
