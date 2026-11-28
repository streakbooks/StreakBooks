# Gym & Fitness Management

Gym & Fitness is an organisation module inside StreakBooks. It keeps members, plans, schedules and commercial balances. Money moves only through `public.post_journal`.

Disabling the module sets `gym_settings.enabled` to false. It does not delete journals, charges or recognition history. Posting, booking and check-in then fail until the module is activated again.

## Accounting

| Event | Debit | Credit |
| --- | --- | --- |
| Membership invoice | Accounts receivable | Deferred membership revenue, and joining-fee revenue only when the contract earns the fee immediately |
| Receipt of cash or bank transfer | Bank | Accounts receivable |
| Monthly or daily recognition | Deferred membership revenue | Membership revenue |
| Cancellation with `keep_deferred` | No journal | The remaining schedule stays a liability |
| Refund of unrecognised balance | Deferred membership revenue | Bank or accounts receivable |
| Forfeit, only when the contract says so | Deferred membership revenue | Cancellation fee revenue |
| Prepaid sessions sold | Accounts receivable | Prepaid session liability |
| Session delivered | Prepaid session liability | Session revenue |
| Approved commission | Commission expense | Commission payable |
| Customer-funded voucher | Bank | Voucher liability |

Tax is calculated from the basis points stored on the plan version. Those points are configuration, not a statutory rate table.

Card gateways, UPI and direct debit are not marked successful. A pending collection stores no journal. Cash, bank transfer, and a manual card receipt with evidence do post.

Sales invoices are not created for these journals. Creating them as well would post the same revenue twice. Profit and loss, the balance sheet and bank reconciliation stay in Reports and Banking.

## What is not connected

- Card acquiring, UPI and direct-debit confirmation
- Door hardware, RFID, NFC and biometrics
- Inventory quantities and cost of goods
- Payroll calculation for trainer salaries
- SMS, WhatsApp and campaign delivery
- A public unauthenticated checkout

Equipment can store the id of an existing fixed asset. Depreciation stays in Fixed assets.
