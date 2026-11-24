# 002 — Commodity operations tools

Date: 2 November 2026.

## Context

The control-centre programme includes a status page, help desk, BI warehouse, error tracking, alert routing and e-signature. StreakBooks already has support tickets, in-app announcements, audit rows and database health reads.

## Options

1. Build each commodity product inside StreakBooks.
2. Integrate a specialist service later, and build only the StreakBooks-specific workflow now.

## Decision

Option 2.

- Status page, error tracking, Slack/Teams/SMS routing and e-signature: integrate later. No vendor account is connected, so these are BLOCKED rather than stubbed.
- Support tickets, announcements, audit and the approvals inbox stay in StreakBooks because they are tied to platform permissions and customer scope.
- Revenue definitions stay in `src/lib/platform/revenue-metrics.ts`. A BI export can read them later. No second metrics catalogue.

## Reason

A placeholder status page or help desk would look operational without delivery, retries or an external account. The programme forbids dummy actions.

## How to reverse

Choose a vendor, store credentials only in server environment variables, and add a thin StreakBooks record for the external id. Do not import the vendor's UI.
