/** Shared React Query options for Expense Management server calls. */
export const expenseQueryOptions = {
  /** Missing RPCs / migrations must fail once — do not retry into a long skeleton. */
  retry: false as const,
};
