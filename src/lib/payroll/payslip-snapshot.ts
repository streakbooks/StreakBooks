/** Build immutable payslip display snapshot from approved run figures. */

import type { PayrollComponentKind } from "@/lib/payroll/types";

export type PayslipSnapshotLine = {
  kind: PayrollComponentKind;
  code: string;
  name: string;
  amountMinor: number;
  isEmployer: boolean;
  sortOrder: number;
};

export type PayslipSnapshotTotals = {
  grossEarningsMinor: number;
  employeeDeductionsMinor: number;
  netPayMinor: number;
  employerContributionsMinor: number;
  totalEmployerCostMinor: number;
};

export type PayslipSnapshotBranding = {
  companyName: string;
  brandingName: string | null;
  footerNote: string | null;
  showEmployerCosts: boolean;
  currency: string;
};

export type PayslipSnapshot = {
  version: 1;
  employee: {
    id: string;
    employeeNumber: string;
    displayName: string;
    department: string | null;
    designation: string | null;
  };
  period: { start: string; end: string; paymentDate: string };
  run: { id: string; runNumber: string };
  totals: PayslipSnapshotTotals;
  lines: PayslipSnapshotLine[];
  branding: PayslipSnapshotBranding;
};

export type PayslipSnapshotLineInput = {
  kind: PayrollComponentKind;
  code: string;
  name: string;
  amountMinor: number;
  isEmployer: boolean;
  sortOrder: number;
};

export function buildPayslipSnapshot(input: {
  employee: PayslipSnapshot["employee"];
  period: PayslipSnapshot["period"];
  run: PayslipSnapshot["run"];
  totals: PayslipSnapshotTotals;
  lines: PayslipSnapshotLineInput[];
  branding: PayslipSnapshotBranding;
}): PayslipSnapshot {
  const sorted = [...input.lines].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code),
  );
  return {
    version: 1,
    employee: input.employee,
    period: input.period,
    run: input.run,
    totals: { ...input.totals },
    lines: sorted.map((line) => ({
      kind: line.kind,
      code: line.code,
      name: line.name,
      amountMinor: line.amountMinor,
      isEmployer: line.isEmployer,
      sortOrder: line.sortOrder,
    })),
    branding: { ...input.branding },
  };
}

export function payslipEarnings(snapshot: PayslipSnapshot): PayslipSnapshotLine[] {
  return snapshot.lines.filter((l) => l.kind === "earning" && !l.isEmployer);
}

export function payslipDeductions(snapshot: PayslipSnapshot): PayslipSnapshotLine[] {
  return snapshot.lines.filter((l) => l.kind === "deduction" && !l.isEmployer);
}

export function payslipEmployerLines(snapshot: PayslipSnapshot): PayslipSnapshotLine[] {
  return snapshot.lines.filter((l) => l.isEmployer || l.kind === "employer_contribution");
}
