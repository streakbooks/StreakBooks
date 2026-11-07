export type ExpenseOverviewKpis = {
  legacySubmittedClaims: number;
  legacyReimbursedClaims: number;
  legacyRejectedClaims: number;
  directExpensesDraft: number;
  directExpensesPosted: number;
  emClaimsTotal: number;
  emPendingApproval: number;
  emApproved: number;
  emAwaitingReimbursement: number;
  emFoundationAvailable: boolean;
};

export type ExpenseOverviewResponse = {
  companyId: string;
  kpis: ExpenseOverviewKpis;
  migrationMessage: string | null;
};

export function emptyExpenseOverviewKpis(foundationAvailable: boolean): ExpenseOverviewKpis {
  return {
    legacySubmittedClaims: 0,
    legacyReimbursedClaims: 0,
    legacyRejectedClaims: 0,
    directExpensesDraft: 0,
    directExpensesPosted: 0,
    emClaimsTotal: 0,
    emPendingApproval: 0,
    emApproved: 0,
    emAwaitingReimbursement: 0,
    emFoundationAvailable: foundationAvailable,
  };
}
