# LINKBOOKS — MASTER PRODUCT ENGINEERING & IMPLEMENTATION DIRECTIVE
## Complete Reporting Ecosystem + Permanent Global LookupSelect Architecture

**Priority:** Critical  
**Scope:** Entire LinkBooks Application  
**Implementation:** End-to-End, Production Quality  
**Objective:** Industry-Leading Functionality, Original Product Design, Complete Testing and Independent Final Review

---

# PART A — EXECUTIVE MANDATE

Act as the CTO, Principal Software Architect, Lead Full-Stack Engineer, Database Architect, Accounting Systems Specialist, CFO, Chartered Accountant, CPA and Enterprise Cloud Accounting Software Consultant responsible for LinkBooks.

Your responsibility is to deliver a comprehensive, secure, scalable and genuinely functional cloud accounting platform.

The objective is to provide the breadth, depth, reliability and usability of leading accounting, financial reporting, management accounting and professional advisory platforms.

Benchmark functionality against leading software, including:

**Cloud accounting platforms**
- QuickBooks Online
- Xero
- Zoho Books
- Sage
- MYOB
- FreshBooks
- Wave
- Odoo
- NetSuite
- Microsoft Dynamics 365 Business Central
- Oracle Fusion Cloud Financials
- SAP Business One
- FreeAgent
- Akaunting
- Kashoo

**Management reporting and financial planning**
- Fathom
- Spotlight Reporting
- Syft Analytics
- Jirav
- LivePlan

Research publicly available capabilities, accounting standards, professional workflows, common conventions, user expectations and industry best practices.

Do not limit the research to the listed platforms if additional relevant capabilities are discovered.

**Critical distinction:**

Achieve functional parity where appropriate, not visual or proprietary design parity.

Do not copy competitor source code, protected assets, distinctive screen compositions, branding, documentation, proprietary workflows or other protected product expression.

Develop LinkBooks independently, using its own architecture, design system, visual identity, information architecture and implementation.

Do not sacrifice useful functionality merely to make LinkBooks look different.

---

# PART B — FIRST ACTION: AUDIT THE EXISTING PROJECT

Before changing code, thoroughly inspect:

1. Existing repository and project architecture.
2. Current Git branch, commit history and uncommitted changes.
3. Existing reporting modules and report-generation engine.
4. Existing accounting engine and general ledger.
5. Database schema, migrations and relationships.
6. Frontend components and design system.
7. Backend services and APIs.
8. Existing permissions and multi-tenant architecture.
9. Existing exports and email infrastructure.
10. Existing reusable components, including flyovers and lookup controls.
11. Existing automated tests and CI workflows.
12. Existing Cursor rules and project instructions.

Review all previously completed reporting implementation work.

Prepare an implementation gap register containing:

- Existing functionality.
- Completed functionality.
- Partially implemented functionality.
- Missing functionality.
- Defects.
- Architectural limitations.
- Required integrations.
- Outstanding dependencies.

Do not restart completed work or replace working functionality unnecessarily.

Do not overwrite uncommitted user work.

Continue from the actual repository state.

---

# PART C — COMPLETE REPORTING ECOSYSTEM

## 1. Reporting Centre

Develop a comprehensive LinkBooks Reporting Centre with an original, intuitive information architecture.

Include the following functional areas:

- Reporting Home.
- Standard Reports.
- Custom Reports.
- Adviser and Accountant Reports.
- Management Reports.
- Draft Reports.
- Published Reports.
- Archived Reports.
- Scheduled Reports.
- Report Templates.

You may organise or rename these categories to create a better LinkBooks experience.

Do not reproduce another platform's navigation hierarchy or screen design simply because it is familiar.

### Reporting Home

Provide:

- Frequently used reports.
- Recently accessed reports.
- Favourite reports.
- Saved custom reports.
- Scheduled reports.
- Draft reports requiring attention.
- Reports awaiting approval.
- Published reports.
- Reporting activity.
- Reporting shortcuts.
- Search and categorisation.
- Relevant reporting-period controls.

## 2. Standard Financial Reports

Audit existing reports and implement all applicable reports supported by the accounting architecture.

Include:

**Financial statements**
- Profit and Loss / Income Statement.
- Balance Sheet.
- Cash Flow Statement.
- Statement of Changes in Equity, where supported.
- Trial Balance.
- General Ledger.
- Account Transactions.
- Journal Report.

**Receivables and payables**
- Aged Receivables.
- Aged Payables.
- Customer Statements.
- Supplier Statements.
- Outstanding Invoices.
- Outstanding Bills.
- Receivables Collection Reports.
- Payables Due Reports.

**Sales and purchases**
- Sales by Customer.
- Sales by Product or Service.
- Sales by Account.
- Sales by Period.
- Purchase by Supplier.
- Purchase by Account.
- Purchase by Product.
- Revenue Analysis.

**Other reports**
- Tax and GST Reports.
- Bank Reconciliation Reports.
- Bank Transactions.
- Cash Position.
- Budget vs Actual.
- Financial Ratios.
- Fixed Asset Reports.
- Depreciation Reports.
- Inventory Valuation.
- Stock Movement.
- Payroll Reports, where supported.
- Project Profitability.
- Departmental and Tracking Reports.
- Consolidated Financial Statements, where supported.

Reports must support appropriate date ranges, accounting basis, comparative periods, filters, grouping, sorting, drill-down and export.

## 3. Custom Report Management

Users must be able to:

- Create reports.
- Save reports.
- Edit reports.
- Duplicate reports.
- Rename reports.
- Categorise reports.
- Organise reports into folders or collections.
- Search and filter reports.
- Mark favourites.
- Set report ownership.
- Manage sharing and access.
- Save report configurations.
- Preview reports.
- Publish reports.
- Archive reports.
- Restore archived reports where appropriate.
- Delete reports with suitable safeguards.

Maintain report history and ownership.

## 4. Advanced Custom Report Builder

Build a genuinely functional report builder.

Support:

- Custom rows.
- Custom columns.
- Account grouping.
- Account hierarchy.
- Customer and supplier dimensions.
- Tracking categories.
- Departments and locations.
- Project dimensions.
- Financial periods.
- Comparative periods.
- Monthly, quarterly and annual reporting.
- Year-to-date and financial-year reporting.
- Subtotals.
- Grand totals.
- Custom formulas.
- Calculated columns.
- Conditional formatting.
- Sorting.
- Grouping.
- Filtering.
- Variance analysis.
- Budget comparisons.
- Forecast comparisons.
- Drill-down to source transactions.

Support saving and reusing report configurations.

---

# PART D — ADVANCED REPORT CUSTOMISATION ENGINE

Implement the following controls as functional reporting features, not decorative UI.

## 5. Data Filtering

Provide a flexible filtering engine.

Support filtering by:

- Account.
- Account type.
- Account group.
- Customer.
- Supplier.
- Contact.
- Product or service.
- Transaction type.
- Transaction status.
- Tax code.
- Currency.
- Department.
- Class.
- Location.
- Project.
- Tracking category.
- Employee, where applicable.
- Custom dimensions supported by the application.

Provide filter operators such as:

- Equals.
- Does not equal.
- Contains.
- Does not contain.
- Starts with.
- Ends with.
- Greater than.
- Less than.
- Between.
- Is empty.
- Is not empty.
- In selected values.
- Not in selected values.

Allow multiple filters with clearly defined AND/OR logic.

Provide saved filter configurations.

## 6. Row Customisation

Support:

- Active rows.
- All rows.
- Non-zero rows.
- Zero-balance rows where relevant.
- Selected rows.
- Selected account groups.
- Custom row ordering.
- Expand and collapse groups.
- Show and hide individual rows.
- Subtotals.
- Grand totals.
- Custom sorting.

## 7. Column Customisation

Support:

- Active columns.
- All columns.
- Non-zero columns.
- Period columns.
- Comparative period columns.
- Actual columns.
- Budget columns.
- Forecast columns.
- Variance columns.
- Variance percentage columns.
- Debit and credit columns where relevant.
- Custom calculated columns.
- Column reordering.
- Column visibility.
- Custom column headings.
- Column totals.

## 8. Custom Calculated Fields

Allow users to create, edit, duplicate and delete calculated fields.

Support:

- Gross Profit.
- Gross Margin.
- Operating Profit.
- EBITDA where meaningful.
- Net Profit.
- Net Profit Margin.
- Revenue Growth.
- Expense Growth.
- Budget Variance.
- Variance Percentage.
- Financial Ratios.
- Custom user-defined formulas.

Provide a formula builder with:

- Supported financial functions.
- Arithmetic operators.
- References to report rows and columns.
- Formula validation.
- Error messages.
- Preview.
- Dependency checking.
- Circular reference protection.
- Safe formula execution.
- Appropriate versioning.

Never allow custom formulas to modify source accounting records.

## 9. Number Formatting

Provide:

- Divide by 1.
- Divide by 100.
- Divide by 1,000.
- Divide by 1,000,000.
- Currency symbols.
- Decimal precision.
- Round to whole numbers.
- Show configurable decimal places.
- Thousands separators.
- Negative values as -100.
- Negative values as (100).
- Negative numbers in red.
- Zero values as zero, dash or blank.
- Percentage formatting.
- Date formatting.
- Currency-specific formatting.

Formatting must never change underlying accounting values.

## 10. Accounting-Specific Display Options

Where applicable, provide:

- Show or hide unrealised foreign exchange gains and losses.
- Show realised and unrealised gains separately.
- Show or hide account codes.
- Show or hide account names.
- Show or hide inactive accounts.
- Show opening balances.
- Show closing balances.
- Show debit and credit balances.
- Show account groups.
- Show comparative balances.
- Show subtotals.

Apply accounting-specific options only to reports where they are meaningful.

## 11. Custom Section Titles

Allow users to change displayed report section headings without changing accounting classifications or ledger calculations.

For Profit and Loss reporting, support configurable headings such as:

- Income.
- Cost of Goods Sold.
- Gross Profit.
- Expenses.
- Net Operating Income.
- Other Income.
- Other Expenses.
- Unrealised Gain or Loss.
- Net Other Income.
- Net Income.

Allow users to:

- Rename headings.
- Restore default headings.
- Show or hide sections.
- Reorder sections where appropriate.
- Configure presentation styles.
- Save heading configurations as templates.

## 12. Reusable Report Templates

Save:

- Filters.
- Rows.
- Columns.
- Calculated fields.
- Formulas.
- Number formats.
- Section titles.
- Comparative periods.
- Sorting.
- Grouping.
- Display preferences.

Support personal templates, organisation-wide templates and controlled sharing with authorised users.

Ensure saved settings survive reopening the report.

---

# PART E — MANAGEMENT ACCOUNTING AND ANALYTICS

## 13. Management Reporting

Build a dedicated management reporting environment for business owners, finance teams, CFOs and professional advisers.

Include:

- Revenue analysis.
- Revenue growth.
- Gross profit.
- Gross margin.
- Operating profit.
- EBITDA where meaningful.
- Net profit.
- Net margin.
- Operating expenses.
- Expense trends.
- Cash flow.
- Cash runway.
- Working capital.
- Current ratio.
- Quick ratio.
- Debtor ageing.
- Creditor ageing.
- Customer concentration.
- Supplier concentration.
- Revenue by customer.
- Revenue by product or service.
- Revenue by department or tracking category.
- Expense analysis.
- Budget versus actual.
- Forecast versus actual.
- Financial trends.
- Business KPIs.
- Cash flow projections.
- Financial health indicators.

Each KPI must have a defined formula, data source and reporting period.

Provide interactive dashboards, charts, drill-down and export.

## 14. Budgeting and Forecasting

Implement:

- Annual budgets.
- Monthly budgets.
- Department budgets.
- Account-level budgets.
- Budget revisions.
- Budget version history.
- Budget versus actual.
- Rolling forecasts.
- Cash flow forecasts.
- Revenue and expense assumptions.
- Forecast revisions.
- Best-case scenarios.
- Base-case scenarios.
- Worst-case scenarios.
- Forecast versus actual analysis.
- Variance explanations.

Keep budgets and forecasts separate from posted accounting transactions.

## 15. Management Commentary and Insights

Support management commentary covering:

- Financial performance.
- Significant variances.
- Unusual transactions or movements.
- Cash flow risks.
- Revenue and margin changes.
- Financial trends.
- Opportunities.
- Recommended actions.

AI-assisted commentary may be implemented where appropriate.

AI-generated statements must be grounded in actual report data, identify the reporting period, be editable and require authorised human review before publication.

Never present unverified assumptions as facts.

---

# PART F — CPA / CA FIRM REPORTING

## 16. Multi-Client Reporting Centre

Build a dedicated environment for accounting firms and professional advisers.

Include:

- Central client reporting dashboard.
- Multi-client overview.
- Client-level report access.
- Reporting-period selection.
- Multi-client report generation.
- Client comparisons where authorised.
- Reporting status.
- Outstanding tasks.
- Reporting deadlines.
- Month-end close progress.
- Reconciliation completion.
- Review and approval tracking.
- Staff assignments.
- Client-specific reporting packs.
- Firm performance reporting.
- Workload reporting.
- Exceptions and anomalies.

Maintain strict tenant and client data isolation.

## 17. Management Report Packs

Allow users to create reusable report packs containing:

1. Executive Summary.
2. Profit and Loss.
3. Balance Sheet.
4. Cash Flow Statement.
5. Budget vs Actual.
6. Revenue Analysis.
7. Expense Analysis.
8. Aged Receivables.
9. Aged Payables.
10. Cash Flow Forecast.
11. Financial Ratios.
12. Business KPIs.
13. Management Commentary.
14. Risks and Opportunities.
15. Recommended Actions.

Support:

- Custom templates.
- Client-specific templates.
- Branding.
- Logo and firm details.
- Reporting period selection.
- Editable commentary.
- Review.
- Approval.
- PDF and Excel exports.
- Secure delivery.

## 18. Month-End and Reporting Workflow

Integrate management reporting with month-end close.

Support:

- Month-end checklists.
- Bank reconciliation status.
- Credit card reconciliation status.
- Account reconciliation.
- Journal review.
- Accruals and prepayments review.
- Fixed asset review.
- Accounts receivable review.
- Accounts payable review.
- Tax review where applicable.
- Trial Balance review.
- Financial statement review.
- Management report preparation.
- Reviewer approval.
- Client delivery.
- Completion tracking.

Use actual workflow data and permissions.

---

# PART G — REPORT LIFECYCLE AND DELIVERY

## 19. Report Lifecycle

Implement:

Draft → Review → Approved → Published → Archived.

Support:

- Ownership.
- Assigned reviewers.
- Comments.
- Annotations.
- Approval and rejection.
- Revision history.
- Publication dates.
- Historical snapshots.
- Audit logs.
- Permissions.
- Restoration where appropriate.

Published reports must preserve their historical output and configuration.

## 20. Email, Scheduling and Sharing

Implement:

- PDF delivery.
- Excel delivery.
- CSV delivery.
- Print-friendly reports.
- Scheduled reports.
- Monthly, quarterly and annual schedules.
- Recipient management.
- Delivery history.
- Delivery status.
- Failed-delivery handling.
- Retry.
- Secure sharing.
- Access permissions.

Use the existing approved email infrastructure or Resend.

Real delivery tests require a verified sender, authorised recipient and server-side API secret.

Never expose API keys in chat, frontend code, logs or Git.

Do not claim delivery testing passed until actual delivery is verified.

---

# PART H — PERMANENT GLOBAL LOOKUPSELECT ARCHITECTURE

## 21. Universal LookupSelect Standard

Implement a reusable, production-ready LookupSelect architecture across the entire LinkBooks application.

Every field selecting records from a dynamic dataset must use the shared LookupSelect component or an approved specialised variant.

Applicable records include:

- Chart of Accounts.
- Customers.
- Suppliers.
- Contacts.
- Products.
- Services.
- Inventory.
- Tax rates and tax codes.
- Classes.
- Locations.
- Tracking dimensions.
- Projects and jobs.
- Bank accounts.
- Payment accounts.
- Employees.
- Departments.
- Cost centres.
- Warehouses.
- Currencies where searchable.
- Any future dynamic record selection.

Use accessible native selects for genuinely short, fixed enumerations where appropriate.

## 22. LookupSelect UI Requirements

Implement:

1. Search input at the top.
2. Search by code, name, SKU, description and relevant identifiers.
3. Create New action when permitted.
4. Grouped records with subtle category headings.
5. Code — Name display where codes exist.
6. Scrollable results with visible scrollbar.
7. Configurable maximum popup height.
8. Loading states.
9. Empty states.
10. Error states.
11. Arrow Up and Down navigation.
12. Enter to select.
13. Escape to dismiss.
14. Tab and accessible keyboard interaction.
15. Click-outside dismissal.
16. Clear selection where allowed.
17. Consistent LinkBooks design tokens.
18. White input background.
19. Subtle borders.
20. Dark navy selection highlight.
21. Responsive sizing.
22. Intelligent popup positioning.
23. Collision avoidance.
24. Accessible labels.
25. Combobox semantics.
26. Screen-reader announcements.
27. Focus management.
28. Record descriptions.
29. Secondary metadata.
30. Status indicators.
31. Required and disabled states.
32. Validation errors.
33. Debounced server-side search.
34. Pagination.
35. Stale-request cancellation.
36. Sensible caching.
37. Stable selection using unique record IDs.

## 23. Flyover-Based Record Creation

Clicking Create New must:

- Open the appropriate complete creation form in a LinkBooks flyover.
- Preserve the originating form.
- Preserve unsaved data.
- Preserve search context.
- Prefill relevant information from the search query.
- Validate against backend rules.
- Detect potential duplicates.
- Enforce permissions.
- Save through the authoritative backend service.
- Refresh lookup results.
- Automatically select the successfully created record.
- Return focus to the originating field.
- Preserve user input if creation fails or is cancelled.

Reuse existing flyover architecture wherever possible.

Implement missing infrastructure if required.

Handle nested flyovers, stacking, focus trapping and dismissal correctly.

## 24. Accounting Integrity for Lookups

Respect:

- Organisation and tenant isolation.
- Role-based permissions.
- Active and inactive status.
- Account-type eligibility.
- Tax jurisdiction.
- Tax effective dates.
- Posting restrictions.
- Locked periods.
- Currency compatibility.
- Inventory restrictions.
- Project restrictions.
- Existing document validation.

Frontend filtering must never replace backend validation.

## 25. Specialised Lookup Variants

**Account Lookup**
- Code.
- Name.
- Type.
- Hierarchy.
- Active status.
- Posting eligibility.

**Contact Lookup**
- Name.
- Contact code.
- Customer/supplier classification.
- Relevant status.

**Product Lookup**
- SKU.
- Name.
- Unit.
- Selling price.
- Purchase price.
- Tax defaults.
- Stock availability.

**Tax Lookup**
- Tax name.
- Rate.
- Jurisdiction.
- Effective date.
- Applicability.

**Tracking Lookup**
- Dimension.
- Category.
- Hierarchy.
- Applicable restrictions.

**Bank Lookup**
- Account name.
- Currency.
- Status.
- Permitted transaction usage.

Maintain consistent visual behaviour while showing useful record-specific information.

## 26. Full Application Migration

Audit all existing dropdowns, selects, autocomplete components and dynamic record lookup fields.

Migrate applicable fields across:

- Sales.
- Purchases.
- Banking.
- Accounting.
- Inventory.
- Reports.
- Settings.
- Recurring transactions.
- Journals.
- Payments.
- Refunds.
- Contacts.
- Fixed assets.
- Tax.
- Payroll, where supported.
- All document creation and editing workflows.
- All future modules.

Preserve existing functionality, validation, data bindings and accounting behaviour.

Create or update:

`.cursor/rules/linkbooks-lookup-select.mdc`

Use valid Cursor rule metadata with:

`alwaysApply: true`

Preserve existing project rules and avoid contradictions.

The rule must require future Cursor development to use the shared LookupSelect architecture for applicable record-based fields.

Do not rely exclusively on legacy `.cursorrules` behaviour.

---

# PART I — ACCOUNTING ENGINE AND DATA INTEGRITY

## 27. Accounting Accuracy

Verify:

- Double-entry accounting.
- Debit and credit integrity.
- Trial Balance equality.
- General Ledger accuracy.
- Profit and Loss calculations.
- Balance Sheet integrity.
- Cash Flow Statement calculations.
- Opening and closing balances.
- Posted, draft, voided and reversed transaction treatment.
- Accrual and cash basis where supported.
- Period locking.
- Historical reporting.
- Multi-currency treatment.
- Foreign exchange gains and losses.
- Tax and GST treatment.
- Comparative reporting.
- Budget and forecast separation.
- Account mapping.

Reconcile reports to actual ledger transactions.

Do not use hardcoded financial figures or dummy accounting results.

Do not introduce duplicate accounting calculation engines.

---

# PART J — TECHNICAL ARCHITECTURE AND SECURITY

## 28. Frontend and Backend

Implement complete functionality across frontend, backend, database and APIs.

Use existing LinkBooks architecture and conventions wherever possible.

Ensure:

- Correct component architecture.
- Reusable services.
- Type-safe APIs.
- Input validation.
- Server-side permission enforcement.
- Proper error handling.
- Secure data access.
- Database integrity.
- Appropriate indexing.
- Efficient aggregation.
- Pagination.
- Caching.
- Background processing where necessary.
- Reliable file generation.
- Secure report storage.
- Audit logging.
- Monitoring.

## 29. Multi-Tenant Security

Verify:

- Organisation isolation.
- Client isolation.
- Firm-user permissions.
- Report ownership.
- Role-based access.
- API authorisation.
- Database access policies.
- Secure sharing.
- Secure exports.
- No cross-tenant data leakage.

Test using multiple organisations and user roles.

Do not rely on frontend-only permissions.

---

# PART K — MEASURABLE ACCEPTANCE CRITERIA

## 30. Functional Tests

The following are mandatory:

**Reporting**
- Standard reports produce accurate data.
- Custom reports save, edit, duplicate and archive.
- Filters work correctly.
- Rows and columns are independently configurable.
- Calculated fields execute correctly.
- Number formatting works.
- Section titles can be customised.
- Templates save and reopen correctly.
- Drill-down reaches source transactions.

**Management reporting**
- KPIs use actual data.
- Comparative periods work.
- Budget and forecast comparisons work.
- Commentary is editable.
- Report packs generate correctly.

**CPA reporting**
- Multi-client access works.
- Client isolation is verified.
- Staff assignments work.
- Review and approval work.
- Month-end progress is accurate.

**Report workflow**
- Draft, review, approval, publication and archive work.
- Historical snapshots are retained.
- Audit trails are complete.

**Exports and email**
- PDF, Excel and CSV exports work.
- Exported figures match on-screen figures.
- Scheduling works.
- Delivery status is recorded.
- Real delivery is verified when credentials are configured.

**LookupSelect**
- All applicable dynamic fields use the shared architecture.
- Search works.
- Keyboard navigation works.
- Inline creation works.
- Auto-selection works.
- Permissions are enforced.
- Flyover cancellation preserves state.
- Large datasets work.
- Tenant isolation is enforced.
- Existing workflows remain functional.

## 31. Performance Targets

Measure under a documented test environment.

Target:

- Standard reports: P95 within 3 seconds.
- Custom reports: P95 within 5 seconds.
- Management dashboards: P95 within 4 seconds.
- Report search: P95 within 2 seconds.

Test realistic transaction volumes and concurrent report requests.

For LookupSelect, measure search latency, pagination performance, rendering responsiveness and stale-request handling.

Do not claim unverified performance.

## 32. Code Quality and Regression

Run:

- TypeScript checks.
- Production build.
- Unit tests.
- Integration tests.
- UI tests.
- End-to-end tests.
- Database migration tests.
- Security tests.
- Accessibility checks.
- Relevant lint checks.
- Existing regression suites.

Distinguish newly introduced failures from pre-existing repository issues.

Fix failures introduced by this implementation.

---

# PART L — FINAL INDEPENDENT REVIEW AND REMEDIATION

## 33. Mandatory End-of-Project Review

After implementation, conduct a separate independent review.

Review every relevant:

- Screen.
- Navigation item.
- Report.
- Customisation option.
- Formula.
- Lookup.
- Flyover.
- Workflow.
- API.
- Database change.
- Permission.
- Export.
- Integration.
- Accounting calculation.

Identify:

- Missing functionality.
- Broken controls.
- Incorrect calculations.
- Data inconsistencies.
- Duplicate logic.
- Security defects.
- Permission defects.
- Performance problems.
- Accessibility issues.
- UI inconsistencies.
- Unnecessary complexity.
- Regression.
- Technical debt.
- Originality concerns.

For each issue:

1. Assign an issue ID.
2. Set severity: Critical, High, Medium or Low.
3. Identify the root cause.
4. Implement a correction where in scope.
5. Test the correction.
6. Run regression tests.
7. Record evidence.
8. Mark final status.

Critical and High issues must be resolved before production readiness.

Medium and Low issues must be resolved where reasonably within scope or documented with a justified remediation plan.

Do not suppress issues or report unverified fixes as complete.

## 34. Originality Review

Confirm LinkBooks has its own:

- Product identity.
- Navigation architecture.
- Visual design.
- Component system.
- Report builder.
- Dashboards.
- Management workflows.
- LookupSelect presentation.
- Interaction patterns.

Common industry terminology and accounting conventions are acceptable.

Do not unnecessarily rename standard accounting terms.

Identify and redesign any distinctive presentation that creates avoidable copying concerns.

---

# PART M — PROTECT EXISTING FUNCTIONALITY

## 35. Regression Protection

Preserve existing LinkBooks modules and working functionality.

In particular, do not break:

- Existing accounting engine.
- Sales and purchases.
- Banking.
- Contacts.
- Inventory.
- Tax functionality.
- Existing integrations.
- Voice assistant.
- Superadmin platform.
- Permissions.
- Existing reports.
- Existing user settings.
- Existing database records.

Do not remove useful functionality to simplify implementation.

Avoid unnecessary architectural rewrites.

Any regression introduced by this project must be fixed.

---

# PART N — GITHUB AND DELIVERY

## 36. Final Validation and Merge

After implementation and independent review:

1. Review the full Git diff.
2. Validate migrations.
3. Run required tests.
4. Run type checking.
5. Run production build.
6. Review lint results.
7. Review dependencies and security.
8. Verify no secrets or credentials are committed.
9. Commit and push completed changes.
10. Open or update the relevant pull request.
11. Resolve review feedback.
12. Merge into main only after required CI checks and approvals pass.

Never bypass branch protections or required checks.

If external credentials, infrastructure or approvals are unavailable, document the blocker and complete all independent work.

---

# PART O — FINAL IMPLEMENTATION REPORT

## 37. Required Deliverables

Provide:

1. Complete repository audit.
2. Feature implementation register.
3. List of standard reports.
4. Custom report functionality delivered.
5. Management reporting functionality delivered.
6. CPA firm functionality delivered.
7. Report customisation capabilities delivered.
8. LookupSelect architecture delivered.
9. Complete list of migrated lookup fields.
10. Cursor rule location and contents.
11. Database migrations.
12. Backend and API changes.
13. Security and permission findings.
14. Originality review.
15. Defect register.
16. Test names and results.
17. Performance results.
18. Build status.
19. Email-delivery status.
20. Outstanding dependencies.
21. Known limitations.
22. Git commit and pull request references.
23. Main branch merge status.
24. Completion percentage by category.

Use PASS, PARTIAL, FAIL, BLOCKED and NOT APPLICABLE.

Do not claim 100% completion if mandatory functionality remains unimplemented or unverified.

---

# PART P — EXECUTION RULES

## 38. How to Execute

Do not stop after research, recommendations, screenshots, planning or UI mockups.

Implement real working functionality.

Do not create decorative buttons, fake calculations, static report values, placeholder screens or non-functional controls.

Use existing services and components where reliable.

Implement missing backend and database functionality when necessary.

Do not sacrifice accounting accuracy for visual presentation or performance.

Do not introduce unnecessary dependencies.

Do not overwrite uncommitted work.

Work in controlled phases and maintain a clear progress record.

If Codex reaches its execution or usage limit:

- Leave the repository in a stable state.
- Preserve all completed work.
- Record changed files.
- Record migrations.
- Record tests executed.
- Record outstanding defects.
- Record remaining requirements.
- Provide the exact next implementation steps.

Do not restart the project when continuing.

## FINAL SUCCESS DEFINITION

LinkBooks must deliver a complete, independently designed, secure and scalable accounting and reporting platform.

Its functionality should meet the expectations of businesses, bookkeepers, accountants, CFOs and CPA/CA firms using leading cloud accounting and management reporting software.

Every applicable LookupSelect field must use the permanent shared architecture.

Every reporting and management feature must be connected to actual accounting data and workflows.

Every delivered feature must be tested.

Every significant issue must be identified, fixed or transparently documented.

The result must be a genuinely functional LinkBooks product, not a visual imitation or a collection of unfinished features.