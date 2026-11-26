# 011 — Route-first grouped Settings workspace

Date: 26 November 2026

## Context

The existing Settings Centre already groups categories and supports contextual in-place forms, but its central state lives in query parameters and breadcrumbs are inconsistent. Many module settings are independently persisted and some category metadata claims more completeness than its actual fields provide. The Settings overhaul requires stable nested pages, search, universal breadcrumbs, clear scopes and no duplicated settings values.

## Decision

Retain the authenticated StreakBooks AppShell and grouped persistent Settings navigation, add an overview for discovery, and make canonical nested routes the owner of each page. Contextual links will open the same canonical page and retain only a validated internal return context. Profile, tenant, firm, billing and platform-owner scope remain distinct. Status is declared per capability, not inferred from a category label. No competitor code or assets are reused.

The layout direction is based on documented general patterns across Xero, QuickBooks Online, Zoho Books, FreshBooks, Wave, MYOB Business, Sage Accounting and Odoo. Odoo's public repository is LGPLv3; no Odoo dependency or source is being brought into this project.

## Consequences

- Legacy query URLs and existing module settings routes need compatibility handling and navigation tests.
- Existing persistence remains authoritative; canonical UI consolidation must not introduce duplicate rows or change money/accounting behavior.
- A typed setting coverage registry and tests are required before a setting can be described as fully functional.
- Hosted database changes remain blocked until backup evidence is for the exact configured target project and migration history is reconciled.

## Reversal

Revert the Settings route/IA code while retaining compatibility routes and settings data. Do not drop existing settings tables or remove stored settings as part of a UI rollback.
