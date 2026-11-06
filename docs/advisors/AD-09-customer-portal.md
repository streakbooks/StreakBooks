# AD-09 — Customer portal, notifications, optional calendar OAuth

## Intent

Give Advisors customers a secure portal on existing LinkBooks auth:

- Plan + inclusions
- Appointments (native AD-04 booking)
- Document requests / upload acknowledgement
- Delivery tasks
- Advisor messaging
- Contact updates (email changes stay staff-owned)
- Plan-change and cancellation requests
- In-portal notifications
- Booking email reminders (24h + 2h)

Google/Microsoft calendar OAuth is **optional** and remains `not_configured`. Native booking is the source of truth.

## Surfaces

| Route | Audience |
| --- | --- |
| `/advisors-portal/*` | Linked customers (authenticated) |
| `/advisors/portal/invite/$token` | Accept invite (sign in with invited email) |
| `/advisors-admin/clients` | Invite / unlink portal login |

## Persistence

Migration `20261106200000_advisors_customer_portal.sql`:

- Activates `advisors_clients.linked_user_id` → `auth.users`
- Portal invites, messages, service requests, notifications
- Appointment reminder queue + claim/dispatch RPCs
- Customer `advisors_portal_*` RPCs (linked user only)
- Admin invite / unlink / reply RPCs (`billing.manage`)

Binary uploads continue to reuse company Files when `company_id` is linked. No second storage bucket and no second payment engine.

## Reminders

`advisors_book_appointment` schedules reminder rows. Staff/service runners call `dispatchAdvisorsBookingReminders`, which claims due rows and sends via Resend when configured.
