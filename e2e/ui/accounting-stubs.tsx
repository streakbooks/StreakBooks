// The chart is real. Neighbouring workflows and setup are isolated from the database.
export function JournalsPanel() {
  return <h2>Journal list fixture</h2>;
}

function UnusedAccountingPanel() {
  return null;
}

export {
  UnusedAccountingPanel as CashClassificationPanel,
  UnusedAccountingPanel as DeferralsPanel,
  UnusedAccountingPanel as ConversionBalancesPanel,
  UnusedAccountingPanel as FxPanel,
  UnusedAccountingPanel as FinancialYearsPanel,
  UnusedAccountingPanel as IndustryCoaPanel,
  UnusedAccountingPanel as LedgerHealthPanel,
  UnusedAccountingPanel as ReconciliationExceptionCentre,
  UnusedAccountingPanel as PeriodClosePanel,
  UnusedAccountingPanel as TransactionCorrections,
};
