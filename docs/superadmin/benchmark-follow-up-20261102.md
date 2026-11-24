# Public product/control benchmark follow-up

Reviewed 2 November 2026. This supplements the earlier pricing inventory with
public client-management and permission evidence. No access to a competitor's
private platform-owner console is claimed. Advertised or coming-soon capability
is not proof of production behavior. No vendor layout or wording is copied.

The combined inventory covers 15 accounting products plus Stripe Billing,
Chargebee and LaunchDarkly. Earlier prices in benchmark.md are historical notes
from the preceding run, not freshly validated quotes for a purchase.

| Accounting product | Official source consulted | Behavior considered for StreakBooks |
| --- | --- | --- |
| Xero | https://www.xero.com/us/accountants-bookkeepers/ | Separate practice/partner workspace and client-facing accounting navigation |
| QuickBooks Online / Accountant Suite | https://quickbooks.intuit.com/accountants/intuit-accountant-suite/ | Cross-client attention, configurable client groups and review/audit visibility; coming-soon sections are not treated as shipped |
| Zoho Books | https://www.zoho.com/in/books/accountant/ | Firm collaboration and an explicit practice-management product alongside accounting |
| FreshBooks | https://support.freshbooks.com/hc/en-us/articles/115002261367-What-permissions-can-I-assign-to-my-team-member | Role/permission matrix and client-dependent access; official indexed documentation used after a different article could not be fetched |
| Wave | https://www.waveapps.com/ | Accounting, invoicing and payments share one financial record; the old Pro Network URL redirects to the home page, so a partner console was not verified |
| FreeAgent | https://www.freeagent.com/accountants/ | Practice dashboard and partner journey distinguish practice operations from client books |
| MYOB | https://www.myob.com/au/accountants-and-bookkeepers/products | Practice management, workpapers, documents and tax are distinct operational areas |
| Sage Intacct | https://www.sage.com/en-us/sage-business-cloud/intacct/ | Financial controls, close and auditability are separate from administration; advertised AI performance is not used as a StreakBooks acceptance result |
| Odoo | https://www.odoo.com/documentation/18.0/applications/general/companies/multi_company.html | Allowed companies and record scope need explicit control; official indexed documentation used after direct accounting-document requests timed out |
| NetSuite | https://www.netsuite.com/portal/products/erp/financial-management.shtml | Financial management, subscription billing and risk/compliance are separate disciplines |
| Digits | https://digits.com/ | Firm workflow, reporting and integrations remain distinct surfaces; no automation is claimed without its data source |
| Puzzle | https://puzzle.io/ | Shared accounting platform with optional services; preparations are presented for review before final action |
| Sage Accounting | https://accounting.sageone.co.za/marketing/accountantsedition.aspx | Searchable client list, status/contact context and client-specific tasks/notes |
| Reckon One | https://help.reckon.com/article/o1umlsvm6w-users | Portal staff membership and per-book access are distinct; removing book access need not delete the staff identity |
| Akaunting | https://akaunting.com/hc/docs/users-and-roles/adding-an-accountant/ | Explicit team/accountant invitation workflow rather than implicit platform access |

| SaaS control product | Official source | Applicable behavior |
| --- | --- | --- |
| Stripe Billing | https://docs.stripe.com/billing/entitlements | Provision product-feature access from authoritative entitlement events; keep one entitlement model |
| Chargebee | https://www.chargebee.com/docs/billing/2.0/product-catalog/product-catalog | Separate catalogue, plans, add-ons and price points; no second StreakBooks billing engine |
| LaunchDarkly | https://launchdarkly.com/docs/home/releases/percentage-rollouts | Stable cohort percentage rollout; changes need observed health evidence before broad release |

## Implementation choices and remaining evidence

Essential: trustworthy permissions, one approval inbox, actual mutation effects,
explicit missing/error states, scoped customer information, audit and rollback.
High: self-service finance/provider lifecycle, test-mode webhook replay, usage
reconciliation and service-case ownership. Advanced: permission-scoped global
search, segments, monitored jobs and incident timelines. Future: automated partner
provisioning and sandboxes once billing/isolation/recovery evidence exists.

This continuation implements the metadata customer view and guarded support access.
It does not add competitor-style ledger visibility to platform staff. Feature-level
pricing, limits and private console behavior not stated on these sources remain
unverified. See RESUMPTION-20261102.md for actual StreakBooks gaps and batch status.
