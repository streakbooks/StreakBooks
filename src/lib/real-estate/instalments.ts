export type InstalmentKind =
  | "deposit"
  | "down_payment"
  | "instalment"
  | "balloon"
  | "handover"
  | "milestone"
  | "percentage"
  | "custom";

export type InstalmentLine = {
  sequence: number;
  kind: InstalmentKind;
  label: string;
  dueOn: string;
  amountMinor: number;
};

export type ScheduleSpec = {
  contractMinor: number;
  startOn: string;
  depositMinor?: number;
  downPaymentMinor?: number;
  frequency?: "monthly" | "quarterly" | "annual";
  instalmentCount?: number;
  balloonMinor?: number;
  handoverMinor?: number;
  handoverOn?: string;
  milestones?: { label: string; dueOn: string; amountMinor?: number; percentBps?: number }[];
  percentages?: { label: string; dueOn: string; bps: number }[];
  custom?: { label: string; dueOn: string; amountMinor: number }[];
};

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function assertIsoDate(value: string, label = "Date"): string {
  const match = DATE.exec(value);
  if (!match) throw new Error(`${label} must be YYYY-MM-DD.`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`${label} is not a real calendar date.`);
  }
  return value;
}

export function addMonths(iso: string, months: number): string {
  assertIsoDate(iso);
  if (!Number.isInteger(months)) throw new Error("Month offset must be a whole number.");
  const [yearText, monthText, dayText] = iso.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1 + months;
  const shiftedYear = year + Math.floor(monthIndex / 12);
  const shiftedMonth = ((monthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(shiftedYear, shiftedMonth + 1, 0)).getUTCDate();
  const day = Math.min(Number(dayText), lastDay);
  return new Date(Date.UTC(shiftedYear, shiftedMonth, day)).toISOString().slice(0, 10);
}

function minor(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative whole minor-unit amount.`);
  }
  return value;
}

function positiveLines(lines: InstalmentLine[], contractMinor: number): InstalmentLine[] {
  if (lines.length === 0) throw new Error("A payment plan needs at least one line.");
  if (lines.some((line) => line.amountMinor <= 0)) {
    throw new Error("Every payment line must be a positive amount.");
  }
  const total = lines.reduce((sum, line) => sum + line.amountMinor, 0);
  if (total !== contractMinor) {
    throw new Error("Payment lines must add up to the contract amount.");
  }
  return lines.map((line, index) => ({ ...line, sequence: index + 1 }));
}

function splitEven(total: number, count: number): number[] {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error("Instalment count must be at least 1.");
  }
  const base = Math.floor(total / count);
  const amounts = Array.from({ length: count }, () => base);
  amounts[count - 1] = total - base * (count - 1);
  if (amounts.some((amount) => amount <= 0)) {
    throw new Error("The contract amount is too small for that many instalments.");
  }
  return amounts;
}

function fromParts(
  contractMinor: number,
  parts: { kind: InstalmentKind; label: string; dueOn: string; amountMinor: number }[],
): InstalmentLine[] {
  return positiveLines(
    parts.map((part, index) => ({
      sequence: index + 1,
      kind: part.kind,
      label: part.label,
      dueOn: assertIsoDate(part.dueOn, part.label),
      amountMinor: minor(part.amountMinor, part.label),
    })),
    contractMinor,
  );
}

/** Builds a contractual schedule. None of these lines are revenue or ledger postings. */
export function buildInstalmentSchedule(spec: ScheduleSpec): InstalmentLine[] {
  const contractMinor = minor(spec.contractMinor, "Contract");
  if (contractMinor <= 0) throw new Error("Contract amount must be positive.");
  const startOn = assertIsoDate(spec.startOn, "Start date");
  const modes = [spec.custom, spec.percentages, spec.milestones].filter(
    (mode) => mode && mode.length > 0,
  );
  if (modes.length > 1) {
    throw new Error("Use one of custom lines, percentages or milestones.");
  }

  if (spec.custom && spec.custom.length > 0) {
    return fromParts(
      contractMinor,
      spec.custom.map((line) => ({
        kind: "custom" as const,
        label: line.label || "Custom",
        dueOn: line.dueOn,
        amountMinor: line.amountMinor,
      })),
    );
  }

  if (spec.percentages && spec.percentages.length > 0) {
    const bps = spec.percentages.reduce((sum, line) => sum + line.bps, 0);
    if (bps !== 10000) throw new Error("Percentage lines must total 100%.");
    const amounts = spec.percentages.map((line) => Math.floor((contractMinor * line.bps) / 10000));
    amounts[amounts.length - 1] =
      contractMinor - amounts.slice(0, -1).reduce((sum, amount) => sum + amount, 0);
    return fromParts(
      contractMinor,
      spec.percentages.map((line, index) => ({
        kind: "percentage" as const,
        label: line.label || `Percentage ${index + 1}`,
        dueOn: line.dueOn,
        amountMinor: amounts[index] ?? 0,
      })),
    );
  }

  if (spec.milestones && spec.milestones.length > 0) {
    const usesBps = spec.milestones.every(
      (line) => line.percentBps != null && line.amountMinor == null,
    );
    if (usesBps) {
      const bps = spec.milestones.reduce((sum, line) => sum + (line.percentBps ?? 0), 0);
      if (bps !== 10000) throw new Error("Milestone percentages must total 100%.");
      const amounts = spec.milestones.map((line) =>
        Math.floor((contractMinor * (line.percentBps ?? 0)) / 10000),
      );
      amounts[amounts.length - 1] =
        contractMinor - amounts.slice(0, -1).reduce((sum, amount) => sum + amount, 0);
      return fromParts(
        contractMinor,
        spec.milestones.map((line, index) => ({
          kind: "milestone" as const,
          label: line.label || `Milestone ${index + 1}`,
          dueOn: line.dueOn,
          amountMinor: amounts[index] ?? 0,
        })),
      );
    }
    return fromParts(
      contractMinor,
      spec.milestones.map((line, index) => ({
        kind: "milestone" as const,
        label: line.label || `Milestone ${index + 1}`,
        dueOn: line.dueOn,
        amountMinor: line.amountMinor ?? 0,
      })),
    );
  }

  const deposit = minor(spec.depositMinor ?? 0, "Deposit");
  const down = minor(spec.downPaymentMinor ?? 0, "Down payment");
  const balloon = minor(spec.balloonMinor ?? 0, "Balloon");
  const handover = minor(spec.handoverMinor ?? 0, "Handover");
  const reserved = deposit + down + balloon + handover;
  if (reserved > contractMinor) throw new Error("Fixed lines exceed the contract.");
  const pool = contractMinor - reserved;
  const count = spec.instalmentCount ?? 0;
  if (pool > 0 && count < 1) throw new Error("Regular instalments need a count.");
  if (pool === 0 && count > 0) throw new Error("There is no amount left for regular instalments.");
  const step = spec.frequency === "quarterly" ? 3 : spec.frequency === "annual" ? 12 : 1;
  const regular = pool > 0 ? splitEven(pool, count) : [];
  const lines: { kind: InstalmentKind; label: string; dueOn: string; amountMinor: number }[] = [];
  if (deposit > 0)
    lines.push({ kind: "deposit", label: "Booking deposit", dueOn: startOn, amountMinor: deposit });
  if (down > 0)
    lines.push({ kind: "down_payment", label: "Down payment", dueOn: startOn, amountMinor: down });
  regular.forEach((amount, index) => {
    lines.push({
      kind: "instalment",
      label: `Instalment ${index + 1}`,
      dueOn: addMonths(startOn, step * (index + 1)),
      amountMinor: amount,
    });
  });
  if (balloon > 0) {
    lines.push({
      kind: "balloon",
      label: "Balloon",
      dueOn: addMonths(startOn, step * (regular.length + 1)),
      amountMinor: balloon,
    });
  }
  if (handover > 0) {
    const dueOn =
      spec.handoverOn ?? addMonths(startOn, step * (regular.length + (balloon > 0 ? 2 : 1)));
    lines.push({ kind: "handover", label: "Handover", dueOn, amountMinor: handover });
  }
  return fromParts(contractMinor, lines);
}

/** A suggested charge only. It is not invoiced and not posted. */
export function suggestedLateFeeMinor(
  outstandingMinor: number,
  daysOverdue: number,
  graceDays: number,
  feeBps: number,
): number {
  if (outstandingMinor <= 0 || daysOverdue <= graceDays || feeBps <= 0) return 0;
  if (feeBps > 10000) throw new Error("Late fee cannot exceed 100%.");
  return Math.floor((outstandingMinor * feeBps) / 10000);
}
