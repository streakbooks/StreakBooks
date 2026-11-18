# Product requirements

Build an original accounting-first retail checkout for USA, UK, AU, NZ, CA and IN; restaurant workflows remain optional. Companies, products, contacts, accounts, tax, sales and cash reporting retain their existing ownership. The uploaded directive is the scope authority; `requirements.csv` enumerates its bullet and numbered requirements from sections 4–15 (one row per occurrence). Repeated requirements remain separate; this is traceability, not a weighted completion estimate. Narrative constraints and sections outside that range are additional release obligations.

Primary personas: cashier (checkout), supervisor (cash/refund approvals), accountant (posting and reconciliation), administrator (stores, mappings, hardware). Distinct permissions and tenant/location access must gate each role.

Core acceptance: authoritative prices and tax; atomic durable sale/payment/journal linkage; idempotency across retries; immutable financial history; controlled reversals; period locks; no success while required posting is absent. Stock sales require verified valuation and concurrent stock protection. Payment status differs from sale and fiscal-document status. No offline or terminal authorization is invented.

Batch 1 acceptance: server-authenticated, permission-checked read-only cart preview; bounded active product lookup by name/SKU; company-scoped catalogue values and tax settings; integer-safe Sales math; invalid/inaccessible items fail the whole preview; UI supports search/add/remove/quantity/clear/refresh and visibly labels limitations; company changes unmount the cart. No payment controls.

Release sequence: audit → configuration/register foundation → online non-stock cash checkout/accounting → receipt/refund/cash close → inventory foundation → providers/settlements → offline/hardware → advanced retail/optional restaurant. Each gate requires automated and real-environment evidence before the next dependent release. Independent development can proceed before deployment.
