# 003 — Pricing structure and tax treatment

Date: 2 November 2026. This is an engineering default, not tax, legal or privacy advice.

## Context

Plans already have versioned prices in integer minor units for USD, GBP and INR, with AUD and NZD in the TypeScript catalogue. The programme asks for per-feature prices, usage, bundles and a customer builder, plus tax by jurisdiction.

## Options

1. Hardcode VAT/GST rates in checkout.
2. Store an operator-supplied tax treatment and basis points on each feature price, defaulting to `unspecified` and 0.

## Decision

Option 2. Legal rates are not inferred. `tax_bps` is configuration. Publishing a price does not migrate subscribers; `company_subscriptions.price_version_id` and `grandfathered` stay in force until a noticed migration is run.

Gross-margin floors stay at the existing 70% typical and 40% maximum in `src/lib/billing/margin.ts`. A price under either floor does not publish unless a second approver confirms. Promotions stay in `billing_offers` and are not written into list prices.

Provider price sync stays in test mode and is BLOCKED until test-mode Stripe or Razorpay credentials are available. No live key is required for the quote maths.

## Reason

A hardcoded rate would present a tax determination the owner has not signed. Zero tax is a visible default, not a claim that the supply is exempt.

## How to reverse

Set `tax_bps` and `tax_treatment` on the affected `feature_prices` rows through the audited price workflow. Existing subscription amounts are unchanged until a grandfathering migration is explicitly run.
