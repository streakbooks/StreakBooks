# Settings information architecture and interaction design

**Status:** clean-room target architecture; only the route-first navigation foundation is implemented so far
**Product:** StreakBooks  
**Principles:** clean-room, route-first, permission-aware and based on the actual module registry.

## Decision

Use a persistent Settings workspace inside the existing StreakBooks shell. The workspace has a concise overview, a grouped left navigation on wide screens, a keyboard-operable mobile section picker/back control, and a global setting search. Keep module-specific entry points in their originating workspaces, but route them to the same canonical setting page. Do not duplicate the editing form or create parallel preference values.

This combines direct access and contextual access: the left navigation is stable for orientation; the overview is a discovery surface; in-module links help users at the moment they need a configuration. Organisation settings, user profile, platform-owner controls, firm access and subscriptions remain separate by scope and permission.

## Groups

Adapt the requested categories to registered StreakBooks modules:

1. **Overview** — setup attention, recently changed settings and shortcuts.
2. **Organisation** — business identity, locale, branding, document identity and currencies.
3. **Accounting** — financial year, accounting defaults, opening balances, close dates, dimensions and journal policy.
4. **Sales** — invoice/quote/credit defaults, reminders, payments and customer communications.
5. **Purchases** — bill, supplier, purchase order and approval defaults.
6. **Banking** — feeds, import formats, categorisation rules and reconciliation.
7. **Inventory and assets** — product stock policy, fixed-asset defaults and depreciation.
8. **Payroll and expenses** — payroll setup, expense claims, mileage and reimbursement policy.
9. **Tax** — tax registration, regimes, rates and supported filing workflows.
10. **Reports and projects** — reporting preferences, saved views, dimensions, budgets and time/project setup.
11. **Users and access** — company members, firm grants, scoped roles, approvals and portals.
12. **Approvals and automation** — workflow defaults and approved automated actions.
13. **Notifications** — individual and organisation delivery preferences, with provider state.
14. **Integrations and API** — installed apps, connections, credentials metadata, API keys and webhooks.
15. **AI and voice** — access, limits and confirmation policies, only where an authorized backend exists.
16. **Billing and subscription** — company plan, usage, payer and payment history, separate from partner-service checkout.
17. **Security and audit** — role/security state, audit history and support-access records.
18. **Data and privacy** — export, retention, attachment and privacy controls where implemented.
19. **Personal preferences** — profile, language, regional display choices, navigation and session preferences.

The current navigation groups are a first implementation slice: **Start here**, **Company & preferences**, **Books & compliance**, **Sales, purchases & contacts**, **Banking & operations**, **People & access**, **Automation & connections**, and **Subscription & developer tools**. The more detailed categories above remain the target for subsequent batches; the current navigation must not be read as proof that every category's settings have been consolidated or completed.

Areas backed by separate modules may show a concise handoff card in the Settings workspace while retaining the module's canonical form. A page is marked **PARTIAL** or **UNAVAILABLE** per capability and never exposes a switch without an enforced consumer.

## Route and breadcrumb contract

- Canonical route: `/settings` for overview and `/settings/<group>/<page>` for supported nested pages. Stable slugs are lower-case and URL-safe.
- Every route restores by refresh, browser back/forward and a copied link. Search state is shareable but does not contain secrets or unsaved draft values.
- Each page renders `Settings / Group / Page`; every parent crumb is a link, the current crumb has `aria-current="page"`, and focus order follows the visible order.
- Mobile displays a compact back-to-group action and current page name. Breadcrumb labels must remain available to assistive technology.
- Existing query URLs (`?section=...`, `settingsPanel`, and validated legacy module URLs) continue through redirects or compatibility resolution without losing source context. A bad URL yields an explicit not-found/overview recovery state; it must not silently open unrelated settings.
- A “Back to previous module” link uses a validated internal origin only. It must never change access control or trust arbitrary external return URLs.

## Page and form pattern

- Header: breadcrumbs, concise title and description, availability/effective scope, and only actions the user is authorized to perform.
- Read-only and unavailable states explain the reason and the correct next step. Entitlement prompts use the real billing flow; unconfigured integrations identify the provider setup required.
- Forms keep drafts local until a deliberate save. Inline errors identify the invalid field and state how to fix it. Server validation remains authoritative.
- The save bar appears only while dirty; it states saving/saved/error/conflict clearly and offers save/discard. Leaving while dirty is guarded for internal navigation and browser unload. Refresh restores route, not unsaved data.
- Reset-to-defaults is offered only when the registry supplies a safe default and permission; behavior-changing accounting defaults require a clear impact description.
- Optimistic concurrency detects changes made by another administrator, retains the draft, and gives a safe reload/reconcile choice.

## Search

Search indexes labels, descriptions, synonyms and module terms from the typed setting registry. Results include group, scope and availability. It supports keyboard open, arrow selection, Enter to navigate, Escape to close and a visible result count/empty state. It filters out settings the current user cannot view; hidden permission labels and secret values are never indexed. Selecting a result opens the canonical route and focuses the page title or selected field.

## Access and scope model

- Platform owner controls are outside tenant Settings and require platform authorization.
- Organisation/company fields are shown according to company membership and setting-specific permission.
- User preferences belong to the signed-in user; company admins cannot silently overwrite another user's profile.
- Firm staff permissions remain client-granted and per-client. Billing scope/payer is not an access grant.
- Entitlement state controls availability, but server authorization and row-level security enforce all reads/writes.
- Security controls are described as enforced only when their server/database behavior exists and is tested.

## Responsive and accessibility contract

- Reuse the StreakBooks AppShell, tokens, shared `PageHeader`/workspace patterns and Radix primitives. No competitor product assets, labels, source or distinctive screen layouts.
- Wide layout: bounded grouped side navigation and a content column with useful maximum width. Narrow layout: single-column content, compact back navigation and no nested horizontal scrolling.
- Keyboard: skip link/shell order, nav links, search palette and every form control work without a pointer. Focus is visible and returned sensibly after dialogs/route changes.
- Screen readers receive headings, group labels, current-page state, field errors, save status and unavailable reasons. Color is never the only status signal.
- Respect reduced motion, browser zoom and high contrast. Validate at 320, 390, 768 and desktop widths; run axe on hub, a normal editor, read-only page, conflict and unavailable state.

## Implementation boundaries

1. Keep existing persistence functions and business consumers until a field has been traced and tests prove a safe migration.
2. Additive migrations only, with rollback SQL and tenant RLS; no schema is required merely to rearrange the UI.
3. No new provider, external connection or dependency for this information-architecture change.
4. Every displayed setting will be `IMPLEMENTED`, `PARTIAL`, `PLACEHOLDER`, `MISSING` or `BLOCKED`, with code and test evidence in `coverage-matrix.md`.
