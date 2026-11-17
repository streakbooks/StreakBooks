# Phase execution checklist

States: `Not Started` → `In Progress` → `Implemented` → `Tested` → `Security Verified` → `Integrated` → `Production Verified`

| Phase | Focus | Gate before next |
| ----- | ----- | ---------------- |
| 0 | Audit, PRD, architecture, tracker | Docs present; reuse map clear |
| 1 | Internal DM/groups, realtime, attachments | Two users realtime + isolation |
| 2 | Employee/HR/dept | Sensitive HR/payroll isolation |
| 3 | Customer portal | Invoice discuss; cross-customer deny |
| 4 | Vendor portal | PO discuss; internal hide |
| 5 | Accountant/firm/advisor | Multi-client isolation |
| 6 | Record discuss, approvals, notifications | Formal approval path only |
| 7 | AI/voice/analytics | Feature-flagged; non-blocking |
| 8 | Hardening, tests, deploy readiness | Critical tests green; flag rollout |

Do not mark a phase `Production Verified` without staging/production evidence.
