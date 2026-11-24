# StreakBooks Organisation Settings — functional specification & UI preview

**Status:** implementation baseline for the legacy Settings Centre, not evidence of production deployment.
**Route:** `/settings?section=organisation`. Related workspaces: `/settings?section=accounting`, `/settings?section=documents`, `/settings?section=currencies`.

## Purpose

Let an authorised organisation administrator maintain company identity, local display preferences, document identity and financial defaults without affecting posted ledger history or other organisations. Show current values, clear editing intent, meaningful validation, server outcomes and recovery options. Use a responsive, accessible layout consistent with StreakBooks' own design system.

## UI preview — desktop (responsive wireframe)

```text
┌───────────────────────────────────────────────────────────────────────────────┐
│ Settings Centre                          Search settings             ⌘⇧K       │
├───────────────────────┬───────────────────────────────────────────────────────┤
│ All settings          │ Organisation & Branding                                │
│ Find a setting…       │ Identity, localisation and document presentation       │
│ • Overview            │                                                       │
│ • Organisation        │ ┌─ Organisation details ───────────────────────────┐  │
│ • Accounting          │ │ Organisation name         Legal name             │  │
│ • Sales / Purchases   │ │ Country                   Tax regime             │  │
│ • Banking             │ │ Tax registration number   Prices include tax    │  │
│ • Documents           │ │ [Save details] [Discard]  All changes saved      │  │
│ • Currencies          │ └───────────────────────────────────────────────────┘  │
│ • Users / Audit       │ ┌─ Localisation ───────────────────────────────────┐  │
│                       │ │ Locale               Date format                 │  │
│                       │ │ Document theme colour  Invoice footer           │  │
│                       │ │ [Save localisation] [Discard]  Unsaved changes   │  │
│                       │ └───────────────────────────────────────────────────┘  │
└───────────────────────┴───────────────────────────────────────────────────────┘
```

**Mobile preview:** replace the persistent sidebar with one accessible “Settings section” selector; render form fields in a single column; Save/Discard controls wrap without horizontal clipping. The production implementation uses the existing StreakBooks cards, tabs, switches, comboboxes and tokens rather than copying a competitor's visual styling.

## Existing editable fields & persistence

| Workspace | Fields | Existing authority and behavior |
| --- | --- | --- |
| Organisation details | Display name, legal name, country, tax regime, registration number, prices include tax | `updateCompany`; `companies` + `company_tax_settings` |
| Financial defaults | Base currency, timezone, FY end month/day | Same `updateCompany`; base currency restrictions remain server enforced |
| Localisation | Locale, date format, document colour, invoice footer | `updateLocalization`; `companies` |
| Document branding | Trading name, letterhead, invoice email, invoice phone, logo HTTPS URL | `upsertBranding`; `company_branding` |
| Number sequences | Prefix, next number, padding per supported document type | `updateDocumentSequence`; `document_sequences` |
| Enabled currencies | Non-base currency codes | `setEnabledCurrencies`; `company_currencies` |
| Exchange rate | From currency, rate date, positive numeric rate to base | `createExchangeRate`; append-only rates; void separately |

## Required functional behavior

1. **Fetch:** Read the active organisation only; show loading, errors with Retry, and genuine saved values. No editing before source data has loaded. Never display placeholders as persisted values.
2. **Draft:** Preserve per-workspace changes during background refetch; display unsaved status and warn before reload/close. Avoid coupling unrelated workspaces: saving branding must not save currencies.
3. **Save:** Disable action while pending, read-only, clean or invalid; use real server function, show failure inline and success only after the server resolves. Users can Discard to reload the last fetched server state.
4. **Conflict:** Detect differences between the editor's baseline and newly fetched server values; block saving the stale draft and offer Reload latest. This frontend check is **not** a substitute for database-level optimistic concurrency (see remaining work).
5. **Validation:** Company name 2–160 characters; valid FY day for selected month; document colour `#RRGGBB`; optional invoice reply email; HTTPS logo URL; sequence next number positive integer and padding 1–10; FX rate finite and > 0. Invalid sequence values show no manufactured preview.
6. **Permissions:** `company.settings.edit` for editable organisation settings, `periods.lock` for financial lock policies. Server auth, membership checks and RLS are authoritative; frontend gating is only UX.
7. **Accounting safety:** Never rewrite posted journals, financial periods or historical numbering. Invalidate matching TanStack queries after an accepted save; maintain tenant isolation.
8. **Accessibility:** Explicit labels, described errors, responsive controls, keyboard focus, honest status announcements, adequate contrast and no duplicate inert Save buttons.

## Remaining implementation / release gates

- Database-enforced optimistic versions for legacy `companies`, `company_branding`, `company_currencies` and document sequences; frontend refresh comparisons alone cannot prevent a race between reads and writes.
- Transactional replacement of `company_currencies` so a failed insert cannot leave an organisation's allowed currency set empty.
- Authenticated mobile, desktop, assistive-technology and end-to-end network/save tests against a dedicated staging organisation.
- Correct Vercel production project must be connected to `streakbooks/StreakBooks` before deploying; the old `streakbooks/StreakBooks` project is not the deployment target.
- Optional future enhancements (not currently claimed delivered): address/contact people, custom fields, localisation beyond supported allowlist, multi-entity registration details, document logo uploads from storage, audit diff view, and account-specific risk confirmations.
