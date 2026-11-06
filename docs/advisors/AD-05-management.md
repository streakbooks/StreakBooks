# AD-05 — Inquiry, customer and advisor management

## Admin console

Authenticated routes under `/advisors-admin`:

| Route | Purpose |
| --- | --- |
| `/advisors-admin` | Overview metrics from live Advisors tables |
| `/advisors-admin/inquiries` | Lead search, assignment, status, promote to client |
| `/advisors-admin/conversations` | Transcript review, assignment, open/hand-off/close |
| `/advisors-admin/clients` | Client CRM create/update (email unique) |
| `/advisors-admin/staff` | Advisor directory create/update |
| `/advisors-admin/appointments` | Booking controls (AD-04) |
| `/advisors-admin/settings/services-pricing` | Catalogue draft/publish (AD-02) |

Overview shows only metrics backed by existing Advisors data (inquiries, conversations, appointments, clients, staff). Subscriptions, MRR, tasks and documents wait for later batches.

## Persistence

Migration `20261106160000_advisors_management_console.sql`:

- Extends `advisors_leads` / `advisors_conversations` with assignment and admin notes
- Adds `advisors_clients` with unique lower(email)
- SECURITY DEFINER platform RPCs gated by `billing.view` / `billing.manage`
- Replaces the zero-arg `platform_advisors_list_conversations()` with filtered overloads

## Non-goals

Engagements, proposals, agreements, billing SKUs, workspaces, tasks, documents, customer portal login and email notifications remain for AD-06+.
