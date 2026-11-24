# Billing platform — invoices, tax, refunds and credit notes

Phase 6. Migration `20261105184413_billing_invoicing_and_tax.sql`; tax arithmetic
`src/lib/billing/domain/tax.ts`; PDF `src/lib/billing/invoice-pdf.server.ts`; customer documents
`billing-documents.functions.ts` and `src/components/billing/BillingDocuments.tsx`; platform finance
`finance-admin.functions.ts` and `src/components/platform/billing/FinanceAdmin.tsx`.

StreakBooks does not decide tax treatment. Every rate, label, treatment and invoice note is entered by
platform staff from professional advice (the rule's "basis"), and applies only after a second
platform owner approves it. Nothing is seeded. Decisions D8 (seller entities and registrations),
D12 (Indian GST treatment) and D13 (India price display) remain open; India stays closed until its
rule is approved.

## Setup before a country can take payments

1. **Seller entity** — legal name, address, tax registrations (for example GSTIN), countries served
   or "default for all other countries". Activated by a platform owner other than its creator.
2. **Numbering series** — one active invoice series and one credit note series per seller. Numbers
   are gapless (the counter is advanced in the issuing transaction) and fit in 16 characters.
   A series cannot be edited or rewound; a new prefix starts a new series.
3. **Tax rule** — country (optional region), customers (all, B2B with a tax ID, B2C), label, rate,
   prices including or excluding tax, treatment (standard, zero-rated, exempt, reverse charge, not
   collected), invoice note, basis, effective dates. Approved by a second platform owner; approved
   rules cannot change and cannot overlap for the same country, region and customer type.
4. **Open the country** (Payments panel) — refused until 1–3 are in place. Countries routed to
   Razorpay need price-inclusive tax, because Razorpay cannot add tax to a price.

## Tax at checkout and on invoices

- Inclusive: the published price is the total; the invoice splits out
  `tax = gross − round(gross × 10000 / (10000 + rate))`.
- Exclusive (Stripe only): Stripe adds an approved tax rate created once per rule; the invoice uses
  the tax Stripe reports as charged.
- B2B applies when the customer has saved a tax ID (Settings → Subscription → Invoices).
- The checkout shows the tax line from the approved rule.

## Invoices

An invoice is issued in the same transaction that records a verified provider payment
(`billing_record_provider_payment`, idempotent per provider payment). It snapshots the seller,
customer, tax rule and amounts, and can never change; corrections are credit notes. If something is
missing (no seller, series or approved rule, or the provider's tax disagrees with the rule) the
payment is recorded with the reason and platform staff issue it later ("Issue pending invoices").
PDFs are generated once from the snapshot, stored privately (`billing-documents` bucket) and opened
through a one-minute signed link after a permission check.

## Refunds and credit notes

1. Platform billing staff request a refund (up to the unrefunded amount, counting open requests).
2. A platform owner other than the requester approves or rejects it.
3. "Send to provider" calls Stripe (idempotency key) or Razorpay with the recorded payment id.
4. On success (immediately or by webhook) the payment and invoice are updated and a numbered credit
   note is issued with tax in proportion to the invoice. Failures leave the payment unchanged.

The earlier one-person Stripe refund action has been removed.

## Not decided (not invented)

Seller legal details and registrations (D8), GST treatment and place of supply (D12), tax-inclusive
India display (D13), refund policy wording (D16). Accounting postings of StreakBooks' own revenue are
outside this module; invoices, payments, refunds and credit notes are exported from the platform
finance panel data.
