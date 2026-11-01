# Module settings navigation

The existing settings pages remain the source of truth. This change adds navigation links only; it does not alter settings persistence, accounting behaviour, integrations, permissions or database schema.

## Paths users can follow

- Sales → Settings → **Invoice themes & branding**, document numbering, reminders, customer defaults and customer portal settings.
- Purchases → Settings → **Purchase document themes**, numbering, supplier defaults, purchase preferences and supplier portal settings.
- Settings → Sales, Purchases, Banking or Documents → the corresponding quick-access links.
- Banking keeps a visible Settings link beside its scrollable workspace tabs.
- Accounting, products, reports, budgets, tax, contacts, projects, files, fixed assets, accountant tools, firm tools and AI have contextual links to their existing relevant configuration screens. Existing Contacts overview settings access is reused.

Sales, Purchases and Banking keep Settings outside the horizontal tab scroller, so it stays available on narrow screens. Invoice branding retains its canonical `/documents/branding` URL. The optional validated `from=purchases` navigation context changes its return link, breadcrumb and selected sidebar module; it does not grant permissions or affect any settings values.

Shared links are defined in `src/lib/settings/module-navigation.ts`. Reusable cards and shortcuts are in `ModuleSettingsLinks.tsx`; the Sales/Purchases tab layout uses `ModuleSubnav.tsx`. Settings search includes invoice branding, templates, PDF and numbering under Sales and purchase themes/remittances under Purchases. Add future module navigation here instead of duplicating settings forms.

## Verification

- TypeScript and production build passed.
- Full regression: 157 test files / 1,199 tests passed.
- Direct-route ownership and breadcrumb tests cover sales branding, purchase context and invalid-origin fallback.
- Isolated Chromium verification at 390 px and 1280 px confirmed visible Settings links, active state, sales/purchase theme navigation, browser Back, numbering and central sales/report settings destinations. Linked paths were checked against the registered route inventory; there were no browser page errors. This checks the actual navigation components with isolated target pages, not an authenticated whole-application acceptance run.
- Changed-file ESLint passed. The central `settings.tsx` file retains its existing formatting-only Prettier findings; its code checks passed with that formatting rule disabled. Only one import and one component insertion changed in that large file, avoiding an unrelated full-file reformat.

No database migrations or new external credentials are required. Existing server authorisation and RLS continue to govern viewing and saving settings.
