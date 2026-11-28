# Gym KPI methods

Figures are calculated from stored rows. The dashboard does not use sample numbers.

| Figure | Method |
| --- | --- |
| Active memberships | Count of memberships with status `active` |
| Monthly recurring revenue | Sum of active week, month, quarter, half-year and year prices converted to a month. Daily, lifetime and session products are excluded. Integer division is used. The remainder is reported separately and is still recognised on the final schedule line. |
| Annual run-rate | Monthly recurring revenue times 12. This is not recognised revenue. |
| Invoiced | Sum of charges that are not void |
| Collected | Sum of posted receipts minus refunded amounts |
| Recognised | Sum of recognition lines with status `recognised` |
| Deferred | Sum of recognition lines with status `scheduled` |
| Outstanding | Sum of open charges minus the amount already allocated |
| Check-ins today | Attendance rows for the current date |
| Retention | `(closing active − new in period) / opening active`. Null when the opening count is zero. |
| Churn insight | Cancelled divided by opening memberships, only when the opening count is at least 5. Otherwise the screen says the cohort is too small. |

An annual fee of 120000 minor units, recognised monthly for 12 months, invoices the full amount to deferred revenue and earns 10000 each month when that line falls due.
