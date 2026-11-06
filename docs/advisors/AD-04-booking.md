# AD-04 — Native appointment booking

## Customer

- `/advisors/book` — date picker, live slots, free 30-minute consultation form
- `/advisors/manage/$manageToken` — secure cancel / reschedule
- Entry points from service selection and Advisors AI chat

## Admin

- `/advisors-admin/appointments` — working hours settings, exceptions, appointment status

## Reliability

Migration `20261106150000_advisors_appointments.sql`:

- Advisor staff, settings, working hours, exceptions, appointments
- GiST exclusion constraint prevents overlapping confirmed appointments
- Slot listing revalidates before booking; idempotency keys supported
- Timestamps stored as `timestamptz` (UTC)

Email reminder delivery remains for the notifications batch (AD-09). Optional Google/Microsoft calendar OAuth is not required for native booking.
