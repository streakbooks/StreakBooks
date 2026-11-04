import type { FirmEngagement } from "@/lib/firm/firm-workflows.functions";

export type PracticeRecurringSchedule = {
  id: string;
  name: string;
  company_id: string;
  frequency: string;
  next_due_date: string;
  is_active: boolean;
  auto_authorise: boolean;
  currency_code: string;
};

const mapping: Record<FirmEngagement["frequency"], string | null> = {
  one_off: null,
  monthly: "monthly",
  quarterly: "quarterly",
  annual: "yearly",
};

export function compatiblePracticeRecurring(
  engagement: Pick<FirmEngagement, "status" | "frequency" | "agreed_fee" | "currency_code">,
  schedule: Pick<
    PracticeRecurringSchedule,
    "frequency" | "is_active" | "auto_authorise" | "currency_code"
  >,
): boolean {
  return (
    engagement.status === "active" &&
    mapping[engagement.frequency] !== null &&
    mapping[engagement.frequency] === schedule.frequency &&
    schedule.is_active &&
    !schedule.auto_authorise &&
    (engagement.agreed_fee === null ||
      engagement.currency_code.toUpperCase() === schedule.currency_code.toUpperCase())
  );
}

export function practiceDraftDue(
  schedule: Pick<PracticeRecurringSchedule, "is_active" | "auto_authorise" | "next_due_date">,
  todayUtc: string,
): boolean {
  return schedule.is_active && !schedule.auto_authorise && schedule.next_due_date <= todayUtc;
}
