# StreakBooks POS implementation

Audit baseline: `ddaff91753976f641a9848c6823cc05d45d99ec2` (fetched main, 2026-11-17).
This folder records implementation evidence, not a production-readiness claim.

- [Product requirements](prd.md), [requirement register](requirements.csv), [tracker](tracker.md)
- [Competitor comparison](competitors.md), [repository gaps](gap-analysis.md)
- [Architecture and decisions](architecture.md), [database plan](database.md)
- [Accounting specification](accounting.md), [permissions and threat model](security.md)
- [Country matrix](tax-currency.md), [payments](payments.md)
- [Offline design](offline.md), [hardware](hardware.md)
- [Screen inventory and guide](workflows.md), [test plan](testing.md), [rollout](rollout.md)

Batch 2 adds dedicated POS permissions, physical-location grants, register configuration and audited cash-float session opening/closing. Access `/pos` and `/pos/registers` from the sidebar. Checkout, payments, cash movements, variance posting, inventory and journals remain unavailable. Database migration is pending explicit live-application approval. See [batch 2 review](batch-2-review.md) for current evidence and limits.
