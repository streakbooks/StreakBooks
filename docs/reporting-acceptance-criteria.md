# MEASURABLE ACCEPTANCE CRITERIA — STREAKBOOKS REPORTING ECOSYSTEM

These acceptance criteria are mandatory. They define when the reporting implementation can be considered complete, validated, and ready for production.

Every criterion must be tested and supported by verifiable evidence.

Do not mark a requirement as complete based only on frontend implementation, successful compilation, or the existence of database tables and API endpoints.

## 1. Reporting Navigation and User Experience

| ID | Acceptance criterion | Pass condition |
|---|---|---|
| UI-01 | Reports homepage | Loads successfully and displays available reporting categories |
| UI-02 | Home navigation | Opens the reporting homepage correctly |
| UI-03 | Custom navigation | Opens the functional custom reports library |
| UI-04 | Adviser navigation | Opens the authorized accounting-firm reporting workspace |
| UI-05 | Drafts navigation | Displays persisted draft reports |
| UI-06 | Published navigation | Displays published reports |
| UI-07 | Archived navigation | Displays archived reports |
| UI-08 | Search | Returns correct reports by name and supported search fields |
| UI-09 | Responsive layout | No broken layouts at supported desktop, tablet, and mobile breakpoints |
| UI-10 | Interaction | All visible buttons, menus, filters, and navigation actions work |

**Pass requirement:** 100% of implemented navigation and visible actions must work. No dead buttons or placeholder screens.

## 2. Custom Report Management

| ID | Acceptance criterion | Pass condition |
|---|---|---|
| CR-01 | Create report | User can create and persist a custom report |
| CR-02 | Edit report | Changes persist correctly |
| CR-03 | Duplicate report | Creates an independent copy without modifying the original |
| CR-04 | Rename report | Updated name persists |
| CR-05 | Delete report | Authorized deletion works with confirmation |
| CR-06 | Archive report | Report moves into Archived |
| CR-07 | Restore report | Archived report returns to the appropriate active state |
| CR-08 | Search reports | Correct results across at least 100 test reports |
| CR-09 | Favourite reports | Favourite status persists after refresh |
| CR-10 | Report templates | Saved templates can be reused |
| CR-11 | Metadata | Creator, modifier, date, owner, and access details are accurate |
| CR-12 | Persistence | Saved reports survive logout, login, and page refresh |

**Pass requirement:** Every CRUD and lifecycle operation must pass automated integration tests.

## 3. Custom Report Builder

| ID | Acceptance criterion | Pass condition |
|---|---|---|
| RB-01 | Account selection | Uses actual chart-of-accounts records |
| RB-02 | Row configuration | Rows can be added, removed, and reordered |
| RB-03 | Column configuration | Columns can be added, removed, and reordered |
| RB-04 | Grouping | Account groups and subtotals calculate correctly |
| RB-05 | Formulas | Valid formulas calculate correctly |
| RB-06 | Formula validation | Invalid formulas are rejected safely |
| RB-07 | Number formatting | Currency, decimals, negatives, and percentages display correctly |
| RB-08 | Filters | Selected filters affect actual report data |
| RB-09 | Comparative periods | Comparison values use correct accounting periods |
| RB-10 | Preview | Preview matches the saved report configuration |
| RB-11 | Reusability | Saved configuration can be reused in another reporting period |
| RB-12 | Persistence | Configuration survives refresh and re-login |

**Pass requirement:** 100% of defined formula test cases and report configuration tests must pass.

## 4. Accounting Accuracy and Reconciliation

This section has zero tolerance for material accounting calculation errors.

| ID | Acceptance criterion | Pass condition |
|---|---|---|
| AC-01 | Profit and Loss | Matches independently calculated ledger totals |
| AC-02 | Balance Sheet | Assets equal liabilities plus equity, within defined rounding tolerance |
| AC-03 | Cash Flow | Opening cash plus net cash movement equals closing cash |
| AC-04 | Trial Balance | Total debits equal total credits |
| AC-05 | General Ledger | Account balances reconcile to posted transactions |
| AC-06 | Aged Receivables | Outstanding balances reconcile to customer subledgers |
| AC-07 | Aged Payables | Outstanding balances reconcile to supplier subledgers |
| AC-08 | Comparative reports | Correct period-to-period calculations |
| AC-09 | Budget variance | Correct actual, budget, and variance amounts |
| AC-10 | Financial ratios | Independently validated formulas |
| AC-11 | Accounting basis | Cash/accrual selection works where supported |
| AC-12 | Transaction status | Draft, posted, voided, reversed, and deleted transactions follow existing accounting rules |
| AC-13 | Multi-currency | Exchange rates and conversion logic follow existing accounting rules |
| AC-14 | Drill-down | Report totals trace to the correct accounts and transactions |

**Pass requirement:**

- Zero unexplained reconciliation differences.
- Zero material financial calculation defects.
- All accounting test fixtures reconcile to independently calculated expected results.
- Rounding differences must follow documented accounting precision and tolerance rules.

Do not hide discrepancies through arbitrary rounding or hardcoded adjustments.

## 5. Management Reporting and KPI Dashboard

| ID | Acceptance criterion | Pass condition |
|---|---|---|
| MR-01 | Management dashboard | Loads actual company financial data |
| MR-02 | Revenue KPIs | Match underlying revenue records |
| MR-03 | Profitability KPIs | Match underlying financial statements |
| MR-04 | Cash metrics | Match underlying cash balances and transactions |
| MR-05 | Working capital | Calculations are independently validated |
| MR-06 | Financial ratios | Formulas and denominators are correct |
| MR-07 | Dashboard filters | Selected periods and dimensions update results |
| MR-08 | Dashboard customization | Users can save and reopen supported configurations |
| MR-09 | Drill-down | KPI values link to relevant underlying reports |
| MR-10 | Empty states | Missing data is clearly identified without fabricated values |

**Pass requirement:** Every implemented KPI must have a documented calculation definition and pass its calculation tests.

## 6. Budgeting and Forecasting

| ID | Acceptance criterion | Pass condition |
|---|---|---|
| BF-01 | Budget creation | Budgets persist correctly |
| BF-02 | Budget editing | Changes persist correctly |
| BF-03 | Actual versus Budget | Variance amounts and percentages reconcile |
| BF-04 | Forecasting | Forecast calculations use documented assumptions |
| BF-05 | Rolling forecasts | Periods update correctly |
| BF-06 | Scenario analysis | Scenario assumptions remain separate |
| BF-07 | Forecast versus Actual | Correct comparative calculations |
| BF-08 | Forecast presentation | Actual and projected values are clearly distinguished |

**Pass requirement:** 100% of defined budgeting and forecasting calculation tests must pass.

## 7. CPA / CA Firm Multi-Client Reporting

| ID | Acceptance criterion | Pass condition |
|---|---|---|
| CPA-01 | Client portfolio | Displays only authorized client companies |
| CPA-02 | Client selection | Authorized clients can be selected |
| CPA-03 | Client reporting | Correct reports generate for each selected client |
| CPA-04 | Firm templates | Templates can be reused across authorized clients |
| CPA-05 | Client-specific settings | Financial years, currencies, and periods are respected |
| CPA-06 | Reporting status | Status reflects actual workflow activity |
| CPA-07 | Multi-client analytics | Aggregates only authorized data |
| CPA-08 | Client isolation | No unauthorized cross-client data access |
| CPA-09 | Report assignment | Authorized users can be assigned preparation and review work |
| CPA-10 | Audit history | Relevant client reporting actions are recorded |

**Pass requirement:** All multi-client permission and isolation tests must pass, including negative authorization tests.

## 8. Management Report Packs

| ID | Acceptance criterion | Pass condition |
|---|---|---|
| MP-01 | Pack creation | Users can create report packs |
| MP-02 | Report selection | Supported reports can be added and removed |
| MP-03 | Report ordering | Reports can be reordered |
| MP-04 | Pack templates | Templates can be saved and reused |
| MP-05 | Executive summary | Commentary can be added and saved |
| MP-06 | Historical packs | Saved snapshots preserve their original values |
| MP-07 | PDF generation | Complete report pack exports correctly |
| MP-08 | Financial reconciliation | Pack figures match individual source reports |
| MP-09 | Client branding | Authorized firm branding appears correctly |
| MP-10 | Report delivery | Authorized users can deliver completed packs |

**Pass requirement:** The generated pack must contain every selected report, with correct ordering, reporting periods, financial values, and presentation.

## 9. Draft, Review, Approval, Published and Archived Workflows

| ID | Acceptance criterion | Pass condition |
|---|---|---|
| WF-01 | Draft creation | Draft is saved and visible in Drafts |
| WF-02 | Review submission | Draft can be submitted to an authorized reviewer |
| WF-03 | Review comments | Comments persist and are attributable |
| WF-04 | Approval | Only authorized reviewers can approve |
| WF-05 | Publication | Approved reports can be published by authorized users |
| WF-06 | Published listing | Published reports appear in Published |
| WF-07 | Historical integrity | Published snapshots preserve their values and configuration |
| WF-08 | Archiving | Reports can be archived |
| WF-09 | Restoration | Authorized users can restore archived reports |
| WF-10 | Audit history | Lifecycle transitions are recorded |

**Pass requirement:** All lifecycle transitions and unauthorized transition attempts must pass automated workflow tests.

## 10. Sharing, Email and Scheduling

| ID | Acceptance criterion | Pass condition |
|---|---|---|
| DS-01 | Private reports | Only authorized users can access them |
| DS-02 | Shared reports | Selected recipients receive the intended permissions |
| DS-03 | Access revocation | Revoked users lose access |
| DS-04 | Email delivery | Actual email delivery is verified through the configured provider |
| DS-05 | PDF attachments | Correct report is attached |
| DS-06 | Scheduling | Saved schedules execute through real scheduling infrastructure |
| DS-07 | Recurrence | Configured recurrence is respected |
| DS-08 | Schedule editing | Changes persist and affect subsequent executions |
| DS-09 | Delivery history | Execution and delivery results are recorded |
| DS-10 | Failure handling | Failed deliveries are logged and reported correctly |

**Pass requirement:** No simulated email delivery or simulated scheduling. Verify successful and unsuccessful execution paths.

## 11. Export and Printing

| ID | Acceptance criterion | Pass condition |
|---|---|---|
| EX-01 | PDF | Opens successfully and contains correct financial figures |
| EX-02 | Excel | Workbook contains usable, correctly formatted data |
| EX-03 | CSV | Contains correct data and headers |
| EX-04 | Filters | Export respects selected filters |
| EX-05 | Formulas | Calculated values match report previews |
| EX-06 | Multiple pages | Page breaks and repeated headers work correctly |
| EX-07 | Currency | Correct currency symbols and formatting |
| EX-08 | Historical reports | Snapshot exports preserve historical values |

**Pass requirement:** All supported export formats must pass content and financial reconciliation tests.

## 12. Security and Data Isolation

| ID | Acceptance criterion | Pass condition |
|---|---|---|
| SEC-01 | Authentication | Unauthenticated users cannot access protected reports |
| SEC-02 | Authorization | Permissions are enforced server-side |
| SEC-03 | Tenant isolation | Cross-tenant data access is prevented |
| SEC-04 | Client isolation | Unauthorized client data access is prevented |
| SEC-05 | API protection | Unauthorized API requests are rejected |
| SEC-06 | Formula security | Arbitrary code execution is prevented |
| SEC-07 | Sharing security | Report access follows configured permissions |
| SEC-08 | Audit trail | Sensitive reporting actions are recorded |
| SEC-09 | Data exposure | No unauthorized financial data is exposed |
| SEC-10 | Migration safety | Database changes preserve existing data integrity |

**Pass requirement:** Zero unresolved critical or high-severity security vulnerabilities. All negative authorization tests must pass.

## 13. Performance and Scalability

Use realistic test datasets and document the environment.

| ID | Acceptance criterion | Target |
|---|---|---|
| PERF-01 | Standard report generation | P95 response time ≤ 3 seconds |
| PERF-02 | Custom report generation | P95 response time ≤ 5 seconds |
| PERF-03 | Management dashboard | P95 load time ≤ 4 seconds |
| PERF-04 | Report search | P95 response time ≤ 2 seconds |
| PERF-05 | Report library | Supports at least 1,000 saved reports in a test environment |
| PERF-06 | Large transaction report | Successfully processes at least 100,000 relevant transaction rows using appropriate pagination or aggregation |
| PERF-07 | Concurrent execution | Supports at least 25 concurrent report requests without data corruption or errors |
| PERF-08 | Memory usage | No uncontrolled memory growth or resource exhaustion |

P95 means the 95th percentile of measured response times.

Targets must be evaluated against documented test hardware, database size, and data volume. If a target is missed, optimize the implementation or document the measured limitation and remediation plan.

Do not sacrifice financial accuracy to improve response times.

## 14. Code Quality and Regression Testing

| ID | Acceptance criterion | Pass condition |
|---|---|---|
| QA-01 | Type checking | No new TypeScript errors |
| QA-02 | Build | Production build succeeds |
| QA-03 | Unit tests | All relevant tests pass |
| QA-04 | Integration tests | All relevant tests pass |
| QA-05 | UI tests | Critical reporting workflows pass |
| QA-06 | Regression tests | Existing accounting functionality remains operational |
| QA-07 | Database migrations | Migrations apply successfully |
| QA-08 | Lint | No new lint violations introduced by the implementation |
| QA-09 | API validation | All relevant API contracts are validated |
| QA-10 | Code review | No unresolved critical or high-severity implementation defects |

Do not weaken, skip, or delete existing tests merely to obtain a passing result.

Distinguish pre-existing failures from newly introduced failures.

## 15. GitHub and Main Branch Integration

| ID | Acceptance criterion | Pass condition |
|---|---|---|
| GIT-01 | Code review | Complete implementation diff reviewed |
| GIT-02 | Commit | Changes committed with descriptive messages |
| GIT-03 | Push | Completed branch pushed successfully |
| GIT-04 | CI | Required CI checks pass |
| GIT-05 | Merge | Changes merged into main through the repository's approved workflow |
| GIT-06 | Final verification | Main contains the intended implementation commit |
| GIT-07 | Repository integrity | No unrelated changes overwritten or lost |

Do not bypass branch protections or force-push.

If approval or repository permissions are required, identify the blocker rather than falsely reporting a successful merge.

---

# 16. FINAL ACCEPTANCE SCORECARD

At the end of implementation, produce a scorecard using these statuses:

- PASS — Fully implemented and tested.
- PARTIAL — Implemented but not fully validated.
- FAIL — Missing, defective, or failing.
- BLOCKED — Dependent on unavailable infrastructure, permissions, or external services.
- NOT APPLICABLE — Not supported by the existing product scope, with a documented justification.

For every criterion, provide:

- Acceptance ID.
- Status.
- Implementation evidence.
- Test name or test result.
- Relevant file or module.
- Known issue, if any.

Calculate completion percentages using:

\[
\text{Completion Rate} =
\frac{\text{Passed Criteria}}{\text{Applicable Criteria}} \times 100
\]

Do not count PARTIAL, FAIL, or BLOCKED criteria as passed.

Provide separate completion percentages for:

1. Reporting navigation and UI.
2. Custom reporting.
3. Accounting accuracy.
4. Management reporting.
5. CPA firm reporting.
6. Report lifecycle.
7. Exports and delivery.
8. Security.
9. Performance.
10. Testing and GitHub integration.

# 17. FINAL PRODUCTION ACCEPTANCE GATE

The reporting ecosystem may be declared production-ready only when all the following conditions are satisfied:

1. All critical functional requirements pass.
2. All accounting reconciliation tests pass.
3. All critical workflow tests pass.
4. All tenant-isolation and authorization tests pass.
5. No unresolved critical or high-severity security defects remain.
6. No critical production-build failures remain.
7. No unresolved critical regression defects remain.
8. Required migrations are successfully validated.
9. Exported reports reconcile to on-screen reports.
10. Historical published reports preserve their approved values.
11. Performance targets are met or formally documented with an accepted remediation plan.
12. The complete implementation has undergone final code review.
13. All required CI checks pass.
14. The verified implementation is merged into main, subject to repository protections.

A high overall completion percentage cannot compensate for a failed accounting accuracy, security, or critical workflow criterion.

**There is no automatic approval based on the number of features implemented. Every critical acceptance gate must pass.**

If any mandatory criterion fails, do not declare the reporting ecosystem production-certified.

Provide the exact remaining work and continue implementation until the acceptance requirements are satisfied.