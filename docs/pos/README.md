# LinkBooks POS implementation

Audit baseline: `ddaff91753976f641a9848c6823cc05d45d99ec2` (fetched main, 2026-11-17).
This folder records implementation evidence, not a production-readiness claim.

- [Product requirements](prd.md), [requirement register](requirements.csv), [tracker](tracker.md)
- [Competitor comparison](competitors.md), [repository gaps](gap-analysis.md)
- [Architecture and decisions](architecture.md), [database plan](database.md)
- [Accounting specification](accounting.md), [permissions and threat model](security.md)
- [Country matrix](tax-currency.md), [payments](payments.md)
- [Offline design](offline.md), [hardware](hardware.md)
- [Screen inventory and guide](workflows.md), [test plan](testing.md), [rollout](rollout.md)

Only the read-only catalogue cart preview is implemented in batch 1. No sale, register session, payment, inventory movement or journal is created by this batch. Access the isolated review route `/pos`; sidebar exposure waits for the transactional POS foundation.
