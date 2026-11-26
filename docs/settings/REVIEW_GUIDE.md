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

## Profile appearance preferences

Route: `/profile` (Profile → Appearance card). Status: **PARTIAL**; colour mode and named palettes sync per user and organisation, while custom colour values remain on the current device.

1. Sign in to a dedicated non-production user who belongs to a test organisation; start the app with `npm.cmd run dev` and open `http://localhost:8080/profile`.
2. Select Light, Dark, and Use device setting. Each selection should update immediately and report a save in the UI.
3. Select a named palette, reload, and confirm the same preference is restored for that user and organisation.
4. Change to another test organisation and confirm that organisation's stored preference loads. Confirm a different user does not inherit the first user's preference.
5. Select Custom palette and confirm the existing custom colours are not replaced by a remote named palette. Reset custom colours and verify only this device's custom values reset.
6. Inspect `getPersonalAppearancePreferences` and `savePersonalAppearancePreferences` behavior through their unit tests. Each validates authentication; the server checks company membership, scopes reads/writes to `context.userId`, and rejects `custom` as a synced palette.
7. For a permissions failure or unavailable Supabase connection, confirm the existing local theme still works and a user-visible error is reported. Use no production account or hosted customer data for this check.

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
