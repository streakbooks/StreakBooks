export const CONTACT_INTERACTION_KINDS = ["note", "call", "email", "meeting", "task"] as const;

export type ContactInteractionKind = (typeof CONTACT_INTERACTION_KINDS)[number];
export type ContactTimelineFilter = "all" | "open_tasks" | "completed_tasks";
export type ContactFollowUpScope = "mine" | "team";

export function normalizeContactFollowUpScope(value: unknown): ContactFollowUpScope {
  return value === "team" ? "team" : "mine";
}

/** Uses the organisation timezone, not the developer machine's timezone. */
export function contactFollowUpDateRange(now: Date, timezone: string, days = 7) {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
  } catch {
    throw new Error("Organisation timezone is invalid");
  }
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const today = `${values["year"]}-${values["month"]}-${values["day"]}`;
  const until = new Date(Date.parse(`${today}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
  return { today, until };
}

export function normalizeContactTimelineFilter(value: unknown): ContactTimelineFilter {
  return value === "open_tasks" || value === "completed_tasks" ? value : "all";
}

export function validateContactInteractionDraft(input: {
  kind: string;
  title: string;
  detail?: string;
  dueOn?: string | null;
  remindOn?: string | null;
}): {
  kind: ContactInteractionKind;
  title: string;
  detail: string;
  dueOn: string | null;
  remindOn: string | null;
} {
  if (!CONTACT_INTERACTION_KINDS.some((kind) => kind === input.kind)) {
    throw new Error("Choose a valid interaction type");
  }
  const title = String(input.title ?? "").trim();
  const detail = String(input.detail ?? "").trim();
  if (!title || title.length > 160) throw new Error("Title must be 1–160 characters");
  if (detail.length > 4000) throw new Error("Details cannot exceed 4,000 characters");
  const dateValue = (value: string | null | undefined, label: string) => {
    const raw = String(value ?? "").trim();
    if (!raw) return null;
    const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00.000Z`) : null;
    if (!date || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== raw) {
      throw new Error(`Choose a valid ${label} date`);
    }
    return raw;
  };
  const dueOn = dateValue(input.dueOn, "follow-up");
  const remindOn = dateValue(input.remindOn, "reminder");
  if (input.kind !== "task" && (dueOn || remindOn)) {
    throw new Error("Only tasks can have follow-up and reminder dates");
  }
  if (remindOn && (!dueOn || remindOn > dueOn)) {
    throw new Error("Reminder date must be on or before the task due date");
  }
  return {
    kind: input.kind as ContactInteractionKind,
    title,
    detail,
    dueOn,
    remindOn,
  };
}
