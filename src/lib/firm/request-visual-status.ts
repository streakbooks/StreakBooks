/**
 * Presentation state for a firm document request. A completion or cancellation
 * is shown only when the underlying authorised request provides its timestamp.
 * Overdue is a derived due-date warning, not a persisted completion state.
 */
export type FirmRequestVisualStatus = "completed" | "cancelled" | "overdue" | "open";

export function firmRequestVisualStatus(
  request: {
    due_date: string;
    action_document_requests?: {
      completed_at?: string | null;
      cancelled_at?: string | null;
    } | null;
  },
  todayIso: string,
): FirmRequestVisualStatus {
  const source = request.action_document_requests;
  if (source?.completed_at) return "completed";
  if (source?.cancelled_at) return "cancelled";
  if (/^\d{4}-\d{2}-\d{2}$/.test(request.due_date) && request.due_date < todayIso) {
    return "overdue";
  }
  return "open";
}
