/** Priority is a severity signal, not a record's accounting/approval status. */
export type NotificationPriorityDisplay = {
  label: string;
  tone: "neutral" | "info" | "warning" | "danger";
  priority: "critical" | "high" | "normal" | "low" | "unknown";
};

const LABELS: Record<string, NotificationPriorityDisplay> = {
  critical: { label: "Critical", tone: "danger", priority: "critical" },
  high: { label: "High priority", tone: "warning", priority: "high" },
  normal: { label: "Normal", tone: "info", priority: "normal" },
  low: { label: "Low", tone: "neutral", priority: "low" },
};

export function notificationPriorityDisplay(
  raw: string | null | undefined,
): NotificationPriorityDisplay {
  if (!raw) return { label: "Unspecified", tone: "neutral", priority: "unknown" };
  return (
    LABELS[raw.trim().toLowerCase()] ?? {
      label: "Unspecified",
      tone: "neutral",
      priority: "unknown",
    }
  );
}
