# Settings module review guide

**Status:** implementation in progress; review findings reflect the local feature branch, not a production deployment.

## What to review

1. Open **Settings** from the left navigation. The existing app shell remains in place.
2. Browse the grouped sections and use **Search settings** to find categories and typed settings such as “late-fee grace period”.
3. Open a category and check the `Settings / Category` breadcrumb. Detail pages use `Settings / Category / Page`.
4. Open a module settings link (for example Sales defaults) and use **Back to Sales** to return to that workspace.
5. Refresh a nested page and use browser Back/Forward. Legacy links such as `/sales/settings` and `/settings?section=sales` should resolve to the canonical route.
6. Inspect a typed editor. Evidence-backed controls remain editable. Other controls display **Partial** and are disabled until their consumer behavior and access tests are established.
7. Try an unsupported category/page and an external `returnTo` value. Invalid routes recover safely; external paths must not be rendered as return links.

## Scope and permission review

- Tenant settings continue to use the existing server functions, membership checks, version checks and row-level security. Route visibility is not authorization.
- Profile preferences stay in the signed-in user's profile area; the Settings category links to that surface instead of treating a personal preference as company-wide.
- Platform-owner controls remain outside tenant settings.
- Configuration secrets are not indexed by settings search.
- A setting marked **Partial** must not be treated as an operative accounting rule.

## Responsive and accessibility review

- Review at 320, 390, 768 and desktop widths.
- Navigate the category groups, search, breadcrumb and forms by keyboard; verify visible focus and Escape behavior in the command palette.
- Check headings, breadcrumb `aria-current`, labels, descriptions, disabled/partial status, inline validation and save status with a screen reader.
- Confirm sticky save actions do not cover fields at mobile widths and unsaved edits are preserved when a navigation blocker is dismissed.

## Test environment

The `e2e/settings-navigation.spec.ts` cases require an authenticated test account supplied through `E2E_EMAIL` and `E2E_PASSWORD`. The local browser session used during this task rendered an application error on `/settings`; do not count that screen as passed browser verification. Use a dedicated, non-production test organisation for save or permission tests.

## Known review boundaries

The registry and coverage matrix enumerate every typed config field and every registered application module. They do not claim every module-specific setting has been consolidated into this workspace. See `coverage-matrix.md` and `defect-register.md` for unresolved implementation and test evidence.
