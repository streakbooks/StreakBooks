export function defaultActivePayrollScheduleId(
  defaultScheduleId: string | null | undefined,
  schedules: readonly { id: string; is_active: boolean }[],
): string {
  if (!defaultScheduleId) return "";
  return schedules.some((schedule) => schedule.id === defaultScheduleId && schedule.is_active)
    ? defaultScheduleId
    : "";
}
