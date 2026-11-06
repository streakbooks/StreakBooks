export type WorkingHours = {
  weekday: number; // 0=Sunday
  startMinute: number;
  endMinute: number;
};

export type BookingSettings = {
  consultationMinutes: number;
  bufferMinutes: number;
  noticeHours: number;
  maxDailyAppointments: number;
  bookingHorizonDays: number;
  isFreeConsultation: boolean;
};

export type BusyInterval = {
  startsAt: Date;
  endsAt: Date;
};

export type GeneratedSlot = {
  startsAt: Date;
  endsAt: Date;
  durationMinutes: number;
};

/** Convert advisor-local wall time on a Y-M-D calendar day into a UTC Date. */
export function advisorLocalToUtc(
  year: number,
  monthIndex: number,
  day: number,
  minuteOfDay: number,
  timeZone: string,
): Date {
  const hours = Math.floor(minuteOfDay / 60);
  const minutes = minuteOfDay % 60;
  const utcGuess = Date.UTC(year, monthIndex, day, hours, minutes, 0);
  const asLocal = new Date(utcGuess);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(asLocal);
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  const shown = Date.UTC(
    read("year"),
    read("month") - 1,
    read("day"),
    read("hour"),
    read("minute"),
  );
  const offset = shown - utcGuess;
  return new Date(utcGuess - offset);
}

export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function generateAvailableSlots(input: {
  day: Date; // date components used in advisor timezone
  timeZone: string;
  workingHours: WorkingHours[];
  settings: BookingSettings;
  busy: BusyInterval[];
  exceptions: BusyInterval[];
  now?: Date;
}): GeneratedSlot[] {
  const now = input.now ?? new Date();
  const year = input.day.getUTCFullYear();
  const month = input.day.getUTCMonth();
  const date = input.day.getUTCDate();
  const weekday = new Date(Date.UTC(year, month, date)).getUTCDay();
  const hours = input.workingHours.find((row) => row.weekday === weekday);
  if (!hours) return [];

  const dayStartLocal = advisorLocalToUtc(year, month, date, 0, input.timeZone);
  const horizonEnd = new Date(now);
  horizonEnd.setUTCDate(horizonEnd.getUTCDate() + input.settings.bookingHorizonDays);
  if (dayStartLocal > horizonEnd) return [];

  const noticeCutoff = new Date(now.getTime() + input.settings.noticeHours * 3_600_000);
  const slots: GeneratedSlot[] = [];
  let cursor = hours.startMinute;
  const dayBusyCount = input.busy.filter((item) => {
    const local = new Date(item.startsAt.toLocaleString("en-US", { timeZone: input.timeZone }));
    return local.getFullYear() === year && local.getMonth() === month && local.getDate() === date;
  }).length;

  while (cursor + input.settings.consultationMinutes <= hours.endMinute) {
    if (dayBusyCount + slots.length >= input.settings.maxDailyAppointments) break;
    const startsAt = advisorLocalToUtc(year, month, date, cursor, input.timeZone);
    const endsAt = new Date(startsAt.getTime() + input.settings.consultationMinutes * 60_000);
    const bufferedStart = new Date(startsAt.getTime() - input.settings.bufferMinutes * 60_000);
    const bufferedEnd = new Date(endsAt.getTime() + input.settings.bufferMinutes * 60_000);
    const blocked =
      startsAt < noticeCutoff ||
      input.exceptions.some((item) => overlaps(startsAt, endsAt, item.startsAt, item.endsAt)) ||
      input.busy.some((item) =>
        overlaps(
          bufferedStart,
          bufferedEnd,
          new Date(item.startsAt.getTime() - input.settings.bufferMinutes * 60_000),
          new Date(item.endsAt.getTime() + input.settings.bufferMinutes * 60_000),
        ),
      );

    if (!blocked) {
      slots.push({
        startsAt,
        endsAt,
        durationMinutes: input.settings.consultationMinutes,
      });
    }
    cursor += input.settings.consultationMinutes + input.settings.bufferMinutes;
  }
  return slots;
}

export function formatSlotLabel(startsAt: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(startsAt);
}

export function detectCustomerTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function defaultWorkingWeek(): WorkingHours[] {
  return [1, 2, 3, 4, 5].map((weekday) => ({
    weekday,
    startMinute: 9 * 60,
    endMinute: 17 * 60,
  }));
}

export function defaultBookingSettings(): BookingSettings {
  return {
    consultationMinutes: 30,
    bufferMinutes: 15,
    noticeHours: 24,
    maxDailyAppointments: 8,
    bookingHorizonDays: 28,
    isFreeConsultation: true,
  };
}
