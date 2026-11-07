# App Store Gap Analysis — Xero-Parity Addendum

Updated after platform-complete batch (UI + fail-closed API mount). Still **0** live third-party connectors.

| Capability | Existing | Fully working | Partial | Missing | Blocked | Notes |
|---|---|---|---|---|---|---|
| Marketplace catalogue / search | ✓ | ✓ (defaults or DB) | | | | AS-01 |
| App detail + honest status | ✓ | ✓ | | | | No fake E2E |
| Top-level App Store nav | ✓ | ✓ | | | | |
| Exceptions / billing / reviews | ✓ UI | ✓ honesty empty | | Charge capture | | AS-04/05 |
| Install wizard (XP-03) | ✓ shell | | OAuth blocked | Live activate | Provider credentials | Activate fail-closed |
| Developer portal sections | ✓ | Partial | Vault issuance | | | AS-05 |
| Platform administration | ✓ | Partial | | Full audit ops | | AS-06; RBAC |
| Universal App Launcher | ✓ UI | Partial | Needs live connection health | | | XP-01 |
| Accountant App Advisory | Schema + UI shell | | Firm recommend/monitor | | Needs practice auth wiring | XP-02 |
| App Certification Program | Schema + badges + admin decide | | Assignment UI later | Reassessment jobs | | XP-04 |
| Developer Partner Program | Schema + UI shell | | | Onboarding workflows | | XP-05 |
| API usage & monetization | Schema + usage UI | | | Metering runtime | Commercial config | XP-06 |
| Publisher growth analytics | Event table + UI | | | Instrumentation | | XP-07 |
| Integration quality gates | Status enum + sandbox UI | | | Sandbox harness | Credentials | XP-08 |
| Version / compatibility | Schema + versions UI | | | Staged release ops | | XP-09 |
| Trust & safety indicators | Badges + suspend | Partial | | Incident paging | | XP-10 |
| Marketplace public HTTP | `/api/marketplace/v1` | Catalogue | Data routes locked | Partner calls | Vault | Fail closed |
| Native Shopify/Amazon/Stripe E2E | Scaffolds | | | Live sync | Credentials / SP-API | Never claim complete |
| Hubdoc / Link My Books | Partner listings | | | Partner APIs | Cooperation | |

**Xero parity:** Not achieved. Benchmark only.
