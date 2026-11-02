# Shared lookup migration inventory — 2026-11-02

The AST inventory records every shared lookup declaration in the current source, including existing domain variants and migrated fields. It is a source inventory, not proof that every application workflow has been exercised with a signed-in production user. Native short fixed enums remain native with reviewed annotations; record identifiers use the shared lookup. Search/keyboard/create/cancel coverage is in `e2e/reporting/reporting.spec.ts`; accounting correction, document theme, practice, voice and wake regressions also passed.

The permanent rule is `.cursor/rules/linkbooks-lookup-select.mdc` (`alwaysApply: true`). Its full contents are maintained there. Enforcement is `scripts/check-lookup-architecture.mjs`, run locally and in CI with `npm run check:lookups`. The guard catches mapped option declarations; it does not prove that every custom widget elsewhere represents a record field correctly.

`RecordLookupSelect` converts legacy declarative option JSX into typed options and renders the original shared `LookupSelect`. `MultiLookupSelect` composes the same component with selected record chips. `useLookupQuery` ignores aborted success, includes page size in cache keys, bounds the cache and deduplicates paginated cached results. Existing domain eligibility and backend posting checks remain authoritative. New create actions are offered only where a real form/save path exists.

| File | Line | Component | Field / identifier |
|---|---:|---|---|
| `src/components/accountant/PracticeWorkBoardView.tsx` | 187 | RecordLookupSelect | Filter client work |
| `src/components/accountant/PracticeWorkBoardView.tsx` | 475 | RecordLookupSelect | Work client |
| `src/components/accounting/AccountForm.tsx` | 305 | AccountLookup | Sub-account of |
| `src/components/accounting/AccountForm.tsx` | 317 | LookupSelect | Default tax |
| `src/components/accounting/ChartAccountsPanel.tsx` | 604 | AccountLookup | Account to keep |
| `src/components/accounting/ChartAccountsPanel.tsx` | 798 | LookupSelect | Source organisation |
| `src/components/accounting/ConversionBalancesPanel.tsx` | 271 | ContactLookup | ariaLabel={kind === "invoices" ? "Customer" : "Supplier"} contacts={contacts} value={r.contactId} onChange={(contactId) => patch(r.key, { co |
| `src/components/accounting/PeriodClosePanel.tsx` | 181 | LookupSelect | Period |
| `src/components/accounting/corrections/TransactionCorrectionsView.tsx` | 280 | RecordLookupSelect | Correction source account |
| `src/components/accounting/corrections/TransactionCorrectionsView.tsx` | 623 | RecordLookupSelect | Correction destination account |
| `src/components/banking/BankCodingPanel.tsx` | 173 | ContactLookup | No contact |
| `src/components/banking/BankCodingPanel.tsx` | 220 | AccountLookup | Account |
| `src/components/banking/BankCodingPanel.tsx` | 250 | TaxLookup | Tax code |
| `src/components/common/EntityCombobox.tsx` | 98 | LookupSelect | voiceField={voiceField} options={lookupOptions} value={value} onChange={onChange} placeholder={placeholder} searchPlaceholder={searchPlaceho |
| `src/components/create-new/JournalPanels.tsx` | 295 | AccountLookup | className="col-span-2 sm:col-span-4" ariaLabel={`Line ${index + 1} account`} accounts={accounts} value={line.accountId} onChange={(accountId |
| `src/components/create-new/MoneyDocumentPanel.tsx` | 216 | ContactLookup | ariaLabel={ kind === "supplier_refund" ? "Supplier" : kind === "receive_money" ? "Payer" : "Customer" } contacts={contacts}  |
| `src/components/create-new/MoneyDocumentPanel.tsx` | 257 | AccountLookup | ariaLabel={kind === "card_payment" ? "Pay from bank" : "Bank or clearing account"} accounts={banks} value={bankAccountId} onChange={setBankA |
| `src/components/create-new/MoneyDocumentPanel.tsx` | 274 | AccountLookup | Income account |
| `src/components/create-new/MoneyDocumentPanel.tsx` | 292 | AccountLookup | Credit card liability |
| `src/components/create-new/MoneyDocumentPanel.tsx` | 322 | AccountLookup | Offset account |
| `src/components/create-new/ProjectPanel.tsx` | 91 | ContactLookup | Customer |
| `src/components/documents/DocumentThemeEditor.tsx` | 511 | RecordLookupSelect | aria-label={`Default theme for ${labelFor(k)}`} className="block w-full rounded border bg-background p-2" disabled={disabled // !canEdit} va |
| `src/components/fixed-assets/AssetDialogs.tsx` | 74 | AccountLookup | id={id} ariaLabel={label} accounts={accounts .filter((a) => types.includes(a.accountType)) .map((a) => ({ id: a.id, code: a.code, name: a.na |
| `src/components/fixed-assets/AssetDialogs.tsx` | 606 | LookupSelect | asset-type |
| `src/components/imports/SourceMigrationWizard.tsx` | 161 | RecordLookupSelect | aria-label={`Map ${field.label}`} className="mt-1 block w-full rounded border bg-background p-2" value={mapping[field.key] ?? ""} onValueCha |
| `src/components/lookup/MultiLookupSelect.tsx` | 15 | LookupSelect | {...props} value="" onChange={(id) => { if (id && !values.includes(id)) onValuesChange([...values, id]); }} allowClear={false} options={prop |
| `src/components/lookup/RecordLookupSelect.tsx` | 33 | LookupSelect | options={declared.options} value={value ?? internal} onChange={(next) => { setInternal(next); onValueChange?.(next); }} disabled={disabled}  |
| `src/components/lookup/create-forms.tsx` | 394 | LookupSelect | Tax rate |
| `src/components/lookup/create-forms.tsx` | 587 | AccountLookup | Ledger account |
| `src/components/lookup/variants.tsx` | 75 | LookupSelect | {...props} options={options} searchPlaceholder={searchPlaceholder} emptyText={emptyText} |
| `src/components/platform/PlatformApprovals.tsx` | 103 | RecordLookupSelect | Feature |
| `src/components/platform/PlatformEditor.tsx` | 266 | RecordLookupSelect | disabled={section === "roles" && f.key === "scope" && !!row} className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={values |
| `src/components/portals/PortalShell.tsx` | 91 | RecordLookupSelect | className="h-9 rounded-md border border-input bg-background px-2" value={current?.membership_id ?? ""} onValueChange={(event) => portal.sele |
| `src/components/portals/staff-panels.tsx` | 122 | RecordLookupSelect | className="mt-1 block h-9 w-full rounded-md border border-input bg-background px-2" value={String(current["settlement_user_id"] ?? "")} onVa |
| `src/components/portals/staff-panels.tsx` | 591 | RecordLookupSelect | className="mt-1 block h-9 w-full rounded-md border border-input bg-background px-2" value={value} onValueChange={(event) => onChange(event)} |
| `src/components/portals/supplier-pages.tsx` | 127 | RecordLookupSelect | className="mt-1 block h-9 w-full rounded-md border border-input bg-background px-2" value={orderId} onValueChange={(event) => setOrderId(eve |
| `src/components/projects/ProjectTagControl.tsx` | 83 | LookupSelect | Project |
| `src/components/purchases/BillMakePaymentPanel.tsx` | 209 | AccountLookup | Paid from |
| `src/components/reports/AdviserReporting.tsx` | 79 | LookupSelect | Reporting firm |
| `src/components/reports/CustomReportDesigner.tsx` | 156 | MultiLookupSelect | Custom report accounts |
| `src/components/reports/LedgerViews.tsx` | 86 | AccountLookup | report-account |
| `src/components/reports/LedgerViews.tsx` | 358 | RecordLookupSelect | jr-source |
| `src/components/reports/LedgerViews.tsx` | 867 | LookupSelect | audit-actor |
| `src/components/reports/ManagementWorkspace.tsx` | 150 | RecordLookupSelect | Open saved dashboard |
| `src/components/reports/ManagementWorkspace.tsx` | 348 | RecordLookupSelect | Open forecast assumptions |
| `src/components/reports/ManagementWorkspace.tsx` | 416 | RecordLookupSelect | forecast-scenario |
| `src/components/reports/PlanningViews.tsx` | 67 | LookupSelect | bva-budget |
| `src/components/reports/ReportAccessDialog.tsx` | 124 | MultiLookupSelect | Report sharing recipients |
| `src/components/reports/ReportAccessDialog.tsx` | 165 | RecordLookupSelect | report-share-firm |
| `src/components/reports/ReportLibrary.tsx` | 224 | RecordLookupSelect | Report type |
| `src/components/reports/ReportLibrary.tsx` | 509 | RecordLookupSelect | custom-base |
| `src/components/reports/ReportPacksWorkspace.tsx` | 603 | RecordLookupSelect | id={`pack-${label}`} className="h-9 w-full rounded border bg-background" value={value} onValueChange={(e) => setter(e)} |
| `src/components/reports/ReportPacksWorkspace.tsx` | 687 | RecordLookupSelect | pack-template |
| `src/components/reports/ReportPacksWorkspace.tsx` | 743 | RecordLookupSelect | aria-label={`Assignee for action item ${i + 1}`} className="h-9 rounded border bg-background" value={item.assigneeId ?? ""} onValueChange={( |
| `src/components/settings/BankImportContent.tsx` | 122 | RecordLookupSelect | value={value === null ? NONE : String(value)} onValueChange={(v) => onChange(v === NONE ? null : Number(v))} |
| `src/components/settings/BankImportContent.tsx` | 355 | BankLookup | Bank account |
| `src/components/settings/BankRulesContent.tsx` | 389 | LookupSelect | Bank account scope |
| `src/components/settings/BankRulesContent.tsx` | 432 | AccountLookup | Account to code to |
| `src/components/settings/BankRulesContent.tsx` | 441 | LookupSelect | Tax code |
| `src/components/settings/BankRulesContent.tsx` | 470 | LookupSelect | Contact |
| `src/components/settings/SettingsDimensionsPanel.tsx` | 193 | LookupSelect | Dimension |
| `src/components/settings/SettingsDimensionsPanel.tsx` | 291 | LookupSelect | Report dimension |
| `src/components/tax/TaxCodesPanel.tsx` | 245 | LookupSelect | Tax rate |
| `src/components/tax/TaxCodesPanel.tsx` | 288 | AccountLookup | Tax account |
| `src/components/tax/TaxReturnsPanel.tsx` | 649 | AccountLookup | Settlement account |
| `src/routes/_authenticated/accountant.tsx` | 218 | AccountLookup | Tax control account |
| `src/routes/_authenticated/accountant.tsx` | 230 | AccountLookup | Offset account |
| `src/routes/_authenticated/banking/cash-coding.tsx` | 280 | LookupSelect | Bank account |
| `src/routes/_authenticated/banking/cash-coding.tsx` | 329 | AccountLookup | Account to code to |
| `src/routes/_authenticated/banking/cash-coding.tsx` | 339 | LookupSelect | Tax code |
| `src/routes/_authenticated/banking/cash-coding.tsx` | 367 | LookupSelect | Contact |
| `src/routes/_authenticated/banking/index.tsx` | 344 | AccountLookup | GL account |
| `src/routes/_authenticated/banking/index.tsx` | 353 | RecordLookupSelect | value={currency ?? baseCurrency} onValueChange={setCurrency} |
| `src/routes/_authenticated/banking/reconcile.tsx` | 206 | BankLookup | Bank account |
| `src/routes/_authenticated/banking/transactions.tsx` | 385 | LookupSelect | Bank account |
| `src/routes/_authenticated/banking/transactions.tsx` | 490 | AccountLookup | Account for bulk coding |
| `src/routes/_authenticated/banking/transactions.tsx` | 500 | LookupSelect | Tax code for bulk coding |
| `src/routes/_authenticated/banking/transfers.tsx` | 163 | BankLookup | From account |
| `src/routes/_authenticated/banking/transfers.tsx` | 176 | BankLookup | To account |
| `src/routes/_authenticated/budgets/$budgetId.tsx` | 434 | AccountLookup | budget-add |
| `src/routes/_authenticated/files.tsx` | 444 | RecordLookupSelect | value={activeFolder.parent_id ?? "root"} onValueChange={(v) => renameFolderM.mutate({ id: activeFolder.id, name: activeFolder.name, parentId |
| `src/routes/_authenticated/files.tsx` | 636 | RecordLookupSelect | value={f.folder_id ?? "unfiled"} onValueChange={(v) => moveM.mutate({ attachmentId: f.id, targetId: v === "unfiled" ? null : v,  |
| `src/routes/_authenticated/firm.tsx` | 184 | LookupSelect | Active firm |
| `src/routes/_authenticated/firm.tsx` | 297 | LookupSelect | Client |
| `src/routes/_authenticated/imports.tsx` | 775 | RecordLookupSelect | budget-import-target |
| `src/routes/_authenticated/imports.tsx` | 914 | RecordLookupSelect | className="w-full rounded-md border bg-background p-2 text-sm" value={selectedColumn} onValueChange={(e) => { setAssetFieldMapping((current) |
| `src/routes/_authenticated/notifications.tsx` | 533 | RecordLookupSelect | value={recipient} onValueChange={setRecipient} |
| `src/routes/_authenticated/notifications.tsx` | 616 | RecordLookupSelect | value={uploaded[r.id] ?? ""} onValueChange={(id) => setUploaded((old) => ({ ...old, [r.id]: id }))} |
| `src/routes/_authenticated/onboarding.tsx` | 150 | RecordLookupSelect | value={countryCode} disabled={busy} onValueChange={(code) => { setCountryCode(code); const match = countries.find((c) => c.code === code); i |
| `src/routes/_authenticated/onboarding.tsx` | 178 | RecordLookupSelect | value={currency} disabled={busy} onValueChange={setCurrency} |
| `src/routes/_authenticated/onboarding.tsx` | 222 | RecordLookupSelect | value={timezone} disabled={busy} onValueChange={setTimezone} |
| `src/routes/_authenticated/products-services.tsx` | 543 | AccountLookup | Income account |
| `src/routes/_authenticated/products-services.tsx` | 557 | AccountLookup | Expense account |
| `src/routes/_authenticated/products-services.tsx` | 631 | LookupSelect | Tax rate |
| `src/routes/_authenticated/purchases/bills.new.tsx` | 2013 | RecordLookupSelect | value={currencyCode} onValueChange={setCurrencyCode} |
| `src/routes/_authenticated/purchases/bills.new.tsx` | 2578 | AccountLookup | Expense account |
| `src/routes/_authenticated/purchases/credit-notes.$creditNoteId.tsx` | 380 | AccountLookup | ariaLabel={`Line ${i + 1} account`} purpose="expense" productKind="product" accounts={accounts} value={l.accountId} onChange={(v) => setEdit |
| `src/routes/_authenticated/purchases/credit-notes.new.tsx` | 254 | ContactLookup | Supplier |
| `src/routes/_authenticated/purchases/credit-notes.new.tsx` | 285 | LookupSelect | Credit from bill |
| `src/routes/_authenticated/purchases/credit-notes.new.tsx` | 331 | AccountLookup | Account |
| `src/routes/_authenticated/purchases/employee-expenses.tsx` | 148 | AccountLookup | Expense account |
| `src/routes/_authenticated/purchases/employee-expenses.tsx` | 194 | AccountLookup | Reimbursement payment account |
| `src/routes/_authenticated/purchases/expenses.new.tsx` | 136 | AccountLookup | Expense account |
| `src/routes/_authenticated/purchases/expenses.new.tsx` | 149 | AccountLookup | Payment account |
| `src/routes/_authenticated/purchases/orders.new.tsx` | 126 | ContactLookup | Supplier |
| `src/routes/_authenticated/purchases/orders.new.tsx` | 155 | AccountLookup | Account |
| `src/routes/_authenticated/purchases/payments.batch.tsx` | 129 | AccountLookup | Bank / cash account |
| `src/routes/_authenticated/purchases/payments.new.tsx` | 241 | RecordLookupSelect | value={currency} onValueChange={(v) => { setCurrencyOverride(v); setAlloc({}); }} |
| `src/routes/_authenticated/purchases/payments.new.tsx` | 288 | AccountLookup | Bank / cash account |
| `src/routes/_authenticated/purchases/statements.tsx` | 87 | ContactLookup | Supplier |
| `src/routes/_authenticated/purchases/statements.tsx` | 113 | RecordLookupSelect | className="rounded-md border bg-background px-2 py-1" value={currency} onValueChange={(e) => setCurrencyChoice(e)} |
| `src/routes/_authenticated/sales/receipts.new.tsx` | 308 | AccountLookup | Deposit account |
| `src/routes/_authenticated/sales/receipts.new.tsx` | 324 | RecordLookupSelect | className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={cur} onValueChange={(e) => { setCurrency(e); setAllo |
| `src/routes/_authenticated/sales/statements.tsx` | 106 | ContactLookup | Customer |
| `src/routes/_authenticated/settings.tsx` | 569 | RecordLookupSelect | value={countryCode} disabled={!canEdit // saveMutation.isPending} onValueChange={setCountryCode} |
| `src/routes/_authenticated/settings.tsx` | 732 | RecordLookupSelect | value={currency} disabled={!canEdit // saveMutation.isPending} onValueChange={setCurrency} |
| `src/routes/_authenticated/settings.tsx` | 751 | RecordLookupSelect | value={timezone} disabled={!canEdit // saveMutation.isPending} onValueChange={setTimezone} |
| `src/routes/_authenticated/settings.tsx` | 1028 | RecordLookupSelect | value={rateFrom} onValueChange={setRateFrom} |
| `src/routes/_authenticated/tax.tsx` | 333 | AccountLookup | Output tax liability |
| `src/routes/_authenticated/tax.tsx` | 345 | AccountLookup | Recoverable input tax |
| `src/routes/_authenticated/tax.tsx` | 357 | AccountLookup | Non-recoverable tax |
| `src/routes/auth_.mfa.tsx` | 130 | RecordLookupSelect | mfa-factor |
| `src/routes/pricing_.builder.tsx` | 72 | RecordLookupSelect | Base plan |

Total: 123 shared declarations; zero guard violations at the recorded run. Source line numbers may shift with later formatting.

Remaining validation: a complete authenticated workflow matrix across every module; large-list server paging for legacy callers that still supply bounded in-memory arrays; per-field eligibility and create permissions against representative tenant data. These are not certified by the static guard.
