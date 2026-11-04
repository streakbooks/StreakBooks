import { toCsv } from "@/lib/sales/csv";
import type { DeferralEntry, DeferralSchedule } from "./deferrals.functions";

export type DeferralFilter = "all" | "active" | "due" | "completed" | "cancelled";

/** Catch-up journals must not be backdated before their due date or future-dated. */
export function canPostDeferralEntry(
  entry: Pick<DeferralEntry, "due_on" | "journal_id">,
  scheduleStatus: string,
  today: string,
  postingDate: string,
): boolean {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  return (
    scheduleStatus === "active" &&
    !entry.journal_id &&
    iso.test(today) &&
    iso.test(postingDate) &&
    iso.test(entry.due_on) &&
    entry.due_on <= today &&
    entry.due_on <= postingDate &&
    postingDate <= today
  );
}

export function filterDeferralPage(
  rows: readonly DeferralSchedule[],
  filter: DeferralFilter,
  today: string,
): DeferralSchedule[] {
  if (filter === "all") return [...rows];
  if (filter === "due") {
    return rows.filter(
      (row) =>
        row.status === "active" &&
        row.deferral_entries.some(
          (entry) => !entry.journal_id && entry.due_on <= today,
        ),
    );
  }
  return rows.filter((row) => row.status === filter);
}

export function deferralPageCounts(rows: readonly DeferralSchedule[], today: string) {
  return {
    schedules: rows.length,
    dueEntries: rows.reduce(
      (sum, row) =>
        sum +
        (row.status === "active"
          ? row.deferral_entries.filter(
              (entry) => !entry.journal_id && entry.due_on <= today,
            ).length
          : 0),
      0,
    ),
    reversedEntries: rows.reduce(
      (sum, row) =>
        sum +
        row.deferral_entries.filter(
          (entry) => Boolean(entry.journals?.reversed_by_journal_id),
        ).length,
      0,
    ),
  };
}

/** The server defines the actual recognition dates; this previews only exact split amounts. */
export function previewDeferralSplit(
  amountMinor: bigint,
  periods: number,
): { regularMinor: bigint; finalMinor: bigint } | null {
  if (!Number.isInteger(periods) || periods < 1 || periods > 120) return null;
  if (amountMinor < BigInt(periods)) return null;
  const count = BigInt(periods);
  const regularMinor = amountMinor / count;
  return {
    regularMinor,
    finalMinor: amountMinor - regularMinor * (count - 1n),
  };
}

/** Export only the currently loaded page, including every loaded schedule entry. */
export function deferralPageCsv(rows: readonly DeferralSchedule[]): string {
  return toCsv(
    [
      "Schedule",
      "Reference",
      "Kind",
      "Schedule status",
      "Total (minor units)",
      "Period",
      "Due date",
      "Period amount (minor units)",
      "Journal ID",
      "Posted date",
      "Journal reversed",
    ],
    rows.flatMap((schedule) =>
      schedule.deferral_entries.map((entry) => [
        schedule.name,
        schedule.reference,
        schedule.kind,
        schedule.status,
        schedule.total_minor,
        entry.period_no,
        entry.due_on,
        entry.amount_minor,
        entry.journal_id,
        entry.posted_on,
        entry.journals?.reversed_by_journal_id ? "Yes" : "No",
      ]),
    ),
  );
}
