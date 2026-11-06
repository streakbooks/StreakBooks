/**
 * Read-only indicators for the Tax workspace. These are setup hints, not statutory
 * compliance checks. Never label an organisation "filing ready" from this summary.
 */
export type TaxWorkspaceInput = {
  regime: string | null | undefined;
  registrationNumber: string | null | undefined;
  filingFrequency: string | null | undefined;
  rates: readonly { is_active: boolean }[];
  codes: readonly { is_active: boolean }[];
  returns: readonly { status: string }[];
  returnsAvailable: boolean;
};

export function summarizeTaxWorkspace(input: TaxWorkspaceInput) {
  const activeRates = input.rates.filter((rate) => rate.is_active).length;
  const activeCodes = input.codes.filter((code) => code.is_active).length;
  const draftReturns = input.returns.filter((item) => item.status === "draft").length;
  const filedReturns = input.returns.filter((item) => item.status === "filed").length;
  const tasks: string[] = [];

  if (!input.regime || input.regime === "none") {
    tasks.push("Review the organisation tax regime before creating tax documents.");
  } else {
    if (!input.registrationNumber?.trim()) {
      tasks.push("Confirm whether a tax registration number is required in this jurisdiction.");
    }
    if (!input.filingFrequency) {
      tasks.push("Set the return frequency to get an appropriate suggested reporting period.");
    }
    if (activeRates === 0) {
      tasks.push("Create a current tax rate or review an available country pack.");
    }
    if (activeCodes === 0) {
      tasks.push("Create active tax codes for sales and purchases.");
    }
  }

  if (!input.returnsAvailable) {
    tasks.push("Tax return storage is unavailable. Verify the tax returns database migration.");
  }
  if (draftReturns > 0) {
    tasks.push("Review saved draft returns before recording them as filed.");
  }

  return {
    activeRates,
    totalRates: input.rates.length,
    activeCodes,
    totalCodes: input.codes.length,
    draftReturns,
    filedReturns,
    tasks,
  };
}
