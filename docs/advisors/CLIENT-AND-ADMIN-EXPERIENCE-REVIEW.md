# Advisors client and admin experience review

## Product split

The Advisors service is operated by Link Business Advisory and sits alongside StreakBooks' accounting product. Its three surfaces have different jobs:

| Surface                              | Audience                                                                        | Belongs here                                                                                                                                                                                      |
| ------------------------------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public `/advisors` and service pages | Prospective client                                                              | Service outcomes, who each service is for, scope and exclusions, transparent plan/pricing details, consultation booking, optional qualification chat, and secure purchase.                        |
| Authenticated `/advisors-portal`     | Paying or onboarded client                                                      | Their own service plan and status, appointments, secure messages, tasks assigned to them, documents they need to share, notifications, and contact or plan-change requests.                       |
| Authenticated `/advisors-admin`      | Link Business Advisory staff and authorised StreakBooks platform administrators | Inquiry triage, assignment, client records, proposals and agreements, onboarding, staff, service delivery, document-request review, appointments, Advisors billing, and catalogue administration. |
| StreakBooks company workspace        | The client and their authorised accounting team                                 | Books, banking, transaction posting, invoices, reports, payroll, tax records, and the company Files repository. Advisors must not create a second ledger or second file store.                    |

Authenticated company users discover the public service catalogue from **Practice → Find an advisor**. This opens the existing `/advisors` page, where they can compare services, view plans, and book or purchase support. **Advisors admin** remains the Link Business Advisory operations workspace; **Advisor portal** is for clients who already have an Advisors service relationship.

Payment operations in the Advisors admin belong to Link Business Advisory. They must remain separate from a StreakBooks company software subscription. Any customer-facing account view should only show the client's own service and its billing status; firm-wide revenue and other clients' billing stay internal.

## Review findings and adjustments

- The public service path already gives prospects plan details, inclusions, exclusions, consultation booking, and a separate Razorpay checkout. Keep qualification chat optional so it does not block plan review.
- The portal home previously showed task, document, and notice counts without direct next actions. It now links those counts into client tasks, file requests, and account updates, and presents plan details as a client service summary.
- The document request action previously said “Mark uploaded”, although that screen does not upload a file. Clients with a linked company are now directed to StreakBooks Files, then can confirm they shared the file. Clients without linked Files are prompted to message their advisor for a secure sharing method.
- The internal overview previously presented many operational counts in one grid. It now groups queues into pipeline, client relationships, service delivery, and firm administration for review.
- Client portal navigation uses client language (“My tasks”, “Files to send”, “Account & requests”). Internal admin navigation remains separate.

## Competitive reference points

Wave positions its service around outsourced bookkeeping or coaching, transaction categorisation, reconciliation, monthly review calls, and the Pro plan; its advisors can be added as collaborators rather than receiving the client's password. [Wave Advisors services](https://support.waveapps.com/hc/en-us/articles/4412407857940-Wave-Advisors-services) and [Wave service page](https://www.waveapps.com/wave-advisors).

Xero's Partner Hub brings client and staff management together with practice workflows such as jobs, time, billing, tax, document packs, reports, and templates. [Xero Partner Hub](https://central.xero.com/0/article/About-Xero-Partner-Hub).

QuickBooks Online Accountant separates internal practice management—clients, team, tasks, deadlines, email prioritisation, and templates—from the client-facing company file. [QuickBooks Practice Manager](https://quickbooks.intuit.com/learn-support/en-uk/help-article/manage-workflows/introducing-quickbooks-online-accountant-practice/L99c4tR3f_GB_en_GB).

FreshBooks Accountant Hub focuses on setting up, accessing, and managing client accounts, with explicit accountant roles and subscription/billing choices. [FreshBooks Accountant Hub](https://www.freshbooks.com/hub/accountants-bookkeepers/work-better-clients-accountants).

These references support a familiar split: clients see service progress and the few actions needed from them; the advisory firm sees pipeline, workload, client portfolio, and billing. StreakBooks should use its own visual identity and interaction patterns rather than reproduce another product's layout.

## Gaps to address in future backed work

- The current portal does not upload files itself. It reuses company Files when the client is linked; otherwise a secure upload/share workflow needs a separately authorised backend before promising upload support.
- Public Razorpay purchases are not yet shown as a full client billing history with downloadable receipts or renewal dates.
- Advisors Stripe payments are not implemented. Add them only with separate Link Business Advisory Stripe credentials and server-side payment verification; never route these charges through StreakBooks' merchant account.
- Admin review can later add overdue task and document queues, reconciliation of provider webhooks against Advisor purchase records, and service-level reporting once those actions and measures have defined backends.

## Manual review

Review public plan selection as a prospect, then the portal as an invited client with and without a linked company Files workspace. Confirm that file confirmation is not presented as an upload, and that client views expose no other client's data or firm-wide metrics. Review admin queues as an authorised staff member. Check desktop, tablet, mobile, keyboard focus, and screen-reader names.
