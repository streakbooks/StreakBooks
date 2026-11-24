# StreakBooks CRM — Competitor research & gap analysis (CRM-01)

**Status:** Verified research for architecture (CRM-01). Not a claim that CRM is production-complete.  
**Originality:** Competitors are functional/usability benchmarks only. StreakBooks must not copy proprietary UI, branding, layouts, icons or source.

## Platforms reviewed

1. Salesforce Sales Cloud  
2. HubSpot CRM  
3. Zoho CRM  
4. Pipedrive  
5. Odoo CRM  
6. Freshsales (Freshworks)  
7. Microsoft Dynamics 365 Sales  
8. monday Sales CRM  

## Feature comparison (capability level)

| Capability | SF | HubSpot | Zoho | Pipedrive | Odoo | Freshsales | D365 | monday | StreakBooks (pre-CRM) | Target |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Lead capture & stages | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | None | Yes |
| Lead scoring / assignment | Yes | Yes | Yes | Partial | Partial | Yes | Yes | Partial | None | Yes |
| Multi-pipeline Kanban | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | None | Yes |
| Deal products & weighted forecast | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Partial | None | Yes |
| Unified customer master | Partial | Partial | Partial | Partial | Yes (ERP) | Partial | Yes | Partial | **Contacts module exists** | Extend, do not duplicate |
| Activities / tasks / calendar | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Contact interactions / follow-ups exist | Extend into CRM |
| Quotes → invoice | Integration | Integration | Yes | Integration | Yes | Partial | Yes | Partial | **Sales quotes → invoice exists** | Bridge from deals |
| Campaigns & attribution | Yes | Yes | Yes | Partial | Yes | Yes | Yes | Partial | None | Yes |
| Workflow automation | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Limited (Action Center) | CRM workflows |
| AI assistance | Yes | Yes | Yes | Yes | Partial | Yes | Yes | Partial | **AI Assistant exists** | Scoped CRM tools |
| Reports / forecasting | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Partial | Financial reports only | CRM reports (labelled vs GL) |
| Teams / territories / RBAC | Yes | Yes | Yes | Partial | Yes | Yes | Yes | Partial | Company roles exist | CRM permissions + ownership |
| App marketplace integrations | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | **App Store foundation** | CRM connectors |
| Tenant isolation / RLS | Cloud tenancy | Cloud | Cloud | Cloud | DB | Cloud | Cloud | Cloud | **Supabase RLS + permissions** | Same pattern |

## StreakBooks assets to reuse (do not rebuild)

| Asset | Path / area | CRM use |
| --- | --- | --- |
| Contacts master | `public.contacts`, `contact_people`, merge RPC | Accounts & CRM contacts identity |
| Contact interactions / follow-ups | `contact_interactions`, Action Center sync | Activity timeline bridge |
| Sales quotes & invoices | `sales_quotes`, `convertQuoteToInvoice` | Quote from deal; no second ledger |
| Products & price lists | Products module + price list migrations | Deal line items |
| Permissions / RLS | `has_company_permission`, role matrix | `crm.*` permission keys |
| Module registry / scaffold | `MODULE_REGISTRY`, `scaffold-module.mjs` | Premium shell inheritance |
| AI Assistant | `/ai-assistant` | Assistive, approval-gated actions |
| App Store | marketplace migrations | Gmail/Outlook/etc. when certified |
| Notifications | Action Center | Reminders & escalations |

## Gap summary (pre-implementation)

1. **No CRM domain tables** for leads, pipelines, opportunities, campaigns, CRM workflows.  
2. **No CRM top-level navigation** or module registry entry.  
3. **No CRM-specific permissions** (`crm.view`, `crm.leads.manage`, …).  
4. **Sales pipeline UI absent** — quotes exist, deal stages/Kanban do not.  
5. **Forecast metrics absent** — must stay separate from posted accounting revenue.  
6. **Automation engine** for CRM events not present (Action Center is notification-centric).  
7. **Email/calendar sync** not live for CRM (App Store catalogue mentions HubSpot as roadmap only).  
8. **AI** has accounting focus; needs CRM tools with permission and audit boundaries.

## Design language stance

Build an original StreakBooks CRM surface using `ListWorkspace` / `RecordWorkspace`, existing tokens/themes, and StreakBooks status semantics. Match or exceed competitor *task completion* (find lead, move deal, convert, quote) without cloning Salesforce Lightning, HubSpot orange chrome, Pipedrive pipeline chrome, or Odoo enterprise skins.

## Batch mapping

| Gap cluster | Batch |
| --- | --- |
| Research, PRD, architecture | CRM-01 |
| Nav, settings, schema, RLS | CRM-02 |
| Leads & conversion | CRM-03 |
| Accounts / contact CRM attributes | CRM-04 |
| Opportunities & Kanban | CRM-05 |
| Activities / tasks / calendar | CRM-06 |
| Communications & integrations | CRM-07 |
| Quotes bridge to Sales | CRM-08 |
| Retention / relationships | CRM-09 |
| Automation & AI | CRM-10 |
| Campaigns, forecast, reports | CRM-11 |
| Teams, territories, settings depth | CRM-12 |
| Security, perf, a11y | CRM-13 |
| Regression & production readiness | CRM-14 |
