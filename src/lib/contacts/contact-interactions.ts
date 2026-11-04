export const CONTACT_INTERACTION_KINDS = ["note", "call", "email", "meeting", "task"] as const;

export type ContactInteractionKind = (typeof CONTACT_INTERACTION_KINDS)[number];
export type ContactTimelineFilter = "all" | "open_tasks" | "completed_tasks";

export function normalizeContactTimelineFilter(value: unknown): ContactTimelineFilter {
  return value === "open_tasks" || value === "completed_tasks" ? value : "all";
}

export function validateContactInteractionDraft(input: {
  kind: string;
  title: string;
  detail?: string;
  dueOn?: string | null;
}): {
  kind: ContactInteractionKind;
  title: string;
  detail: string;
  dueOn: string | null;
} {
  if (!CONTACT_INTERACTION_KINDS.some((kind) => kind === input.kind)) {
    throw new Error("Choose a valid interaction type");
  }
  const title = String(input.title ?? "").trim();
  const detail = String(input.detail ?? "").trim();
  if (!title || title.length > 160) throw new Error("Title must be 1–160 characters");
  if (detail.length > 4000) throw new Error("Details cannot exceed 4,000 characters");
  const dueOn = String(input.dueOn ?? "").trim();
  if (dueOn) {
    const day = /^\d{4}-\d{2}-\d{2}$/.test(dueOn) ? new Date(`${dueOn}T00:00:00.000Z`) : null;
    if (!day || Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== dueOn) {
      throw new Error("Choose a valid follow-up date");
    }
    if (input.kind !== "task") throw new Error("Only tasks can have follow-up dates");
  }
  return {
    kind: input.kind as ContactInteractionKind,
    title,
    detail,
    dueOn: dueOn || null,
  };
}
