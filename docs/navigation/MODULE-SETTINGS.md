# Module settings navigation

The existing settings pages remain the source of truth. Settings now open in the originating workspace using reusable forms. Settings persistence, accounting behaviour, integrations, permissions and database schema are unchanged.

## Paths users can follow

- Sales → Settings → **Invoice themes & branding**, document numbering, reminders, customer defaults and customer portal settings.
- Purchases → Settings → **Purchase document themes**, numbering, supplier defaults, purchase preferences and supplier portal settings.
- Settings → Sales, Purchases, Banking or Documents → the corresponding quick-access links.
- Banking keeps a visible Settings link beside its scrollable workspace tabs.
- Accounting, products, reports, budgets, tax, contacts, projects, files, fixed assets, accountant tools, firm tools and AI have contextual links to their existing relevant configuration screens. Existing Contacts overview settings access is reused.

Sales, Purchases and Banking keep Settings outside the horizontal tab scroller, so it stays available on narrow screens. Contextual links use an allowlisted `settingsPanel` query parameter on the current path. Nested links maintain a bounded `settingsTrail`; Back returns to the parent panel and then the source screen. Source query filters survive opening and closing panels. Background workspace content stays mounted and hidden, preserving unsaved business drafts while a panel is open. Refresh restores the active panel; it does not persist unsaved drafts across a reload. Direct canonical settings URLs continue to work, including `/documents/branding`. The optional validated `from=purchases` navigation context changes its return link, breadcrumb and selected sidebar module; it does not grant permissions or affect any settings values.

Shared links are defined in `src/lib/settings/module-navigation.ts`. Reusable cards and shortcuts are in `ModuleSettingsLinks.tsx`; the Sales/Purchases tab layout uses `ModuleSubnav.tsx`. Settings search includes invoice branding, templates, PDF and numbering under Sales and purchase themes/remittances under Purchases. Add future module navigation here instead of duplicating settings forms.

## Shared defaults and verification

Supplier defaults embeds purchase payment terms and purchase policies alongside shared contact numbering, groups and tags. Customer defaults embeds sales defaults with the same shared contact fields. These views do not silently change the organisation's default contact role. Canonical Contacts settings still offers the global contact defaults.

- TypeScript and production build passed; 158 test files / 1,204 tests passed.
- Five routing tests cover source filters, nested navigation, cycles, query validation and transactional-route separation.
- Isolated Chromium verification with production links, panel frame and surface passed source-path retention, nested Back, browser history, refresh, central category retention and preservation of an unsaved background draft at 390 px. Detail bodies were fixtures; authenticated backend persistence was not browser-tested.
- Extracted content/forms and panel routing passed ESLint. The central settings page retains its pre-existing formatting findings.

No database migrations or new external credentials are required. Existing server authorisation and RLS continue to govern viewing and saving settings.
