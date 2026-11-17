# Payment integration design (unimplemented)

First release target is online cash for non-stock goods/services after session and posting gates. External terminal references must identify an externally completed tender and must not claim automated terminal verification. Integrated terminal/UPI/wallet adapters need supported country, merchant/test credentials, device model and verified provider documentation.

Adapter contract: capabilities, initiate, query, cancel/reverse, capture (if supported), refund, verifyWebhook, listSettlements. Model pending/authorized/captured/failed/reversed/refunded separately from sale and bank settlement. Unique merchant/provider event ID and operation key protect replay/duplicate charges; verify signature against raw body and retain redacted receipt hash. Provider credentials stay server-side. Never store PAN/CVV/PIN.

Split tenders conserve total and refund allocations per original tender. Fees and settlement differences use explicit journal mappings and reconciliation exceptions. Unknown/time-out states require provider status lookup before retry. A displayed success requires durable evidence, not a callback redirect. Gift/store-credit need liability ledgers before acceptance.
