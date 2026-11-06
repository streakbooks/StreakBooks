import { describe, expect, it } from "vitest";
import { mapDocumentRequest, mapWorkspaceDetail } from "@/lib/advisors/workspaces";

describe("advisors workspaces mappers", () => {
  it("maps workspace detail with seeded delivery shape", () => {
    const detail = mapWorkspaceDetail({
      id: "11111111-1111-1111-1111-111111111111",
      engagementId: "22222222-2222-2222-2222-222222222222",
      kind: "bookkeeping",
      status: "active",
      assignedAdvisorId: null,
      title: "Ada Books",
      cadence: "monthly",
      objectives: "Monthly books",
      createdAt: "2026-11-06T00:00:00Z",
      updatedAt: "2026-11-06T00:00:00Z",
      periods: [
        {
          id: "33333333-3333-3333-3333-333333333333",
          workspaceId: "11111111-1111-1111-1111-111111111111",
          label: "Nov 2026",
          periodStart: "2026-11-01",
          periodEnd: "2026-11-30",
          sessionAt: null,
          status: "open",
          summary: "",
          createdAt: "2026-11-06T00:00:00Z",
          updatedAt: "2026-11-06T00:00:00Z",
        },
      ],
      tasks: [
        {
          id: "44444444-4444-4444-4444-444444444444",
          workspaceId: "11111111-1111-1111-1111-111111111111",
          periodId: "33333333-3333-3333-3333-333333333333",
          code: "bank_reconcile",
          title: "Reconcile bank accounts",
          description: "Match statements",
          status: "pending",
          sortOrder: 10,
          requiresDocument: true,
          documentLabel: "Bank statements",
          assignedAdvisorId: null,
          dueAt: null,
          completedAt: null,
          adminNote: "",
          customerNote: "",
          createdAt: "2026-11-06T00:00:00Z",
          updatedAt: "2026-11-06T00:00:00Z",
        },
      ],
      documentRequests: [],
      notes: [],
    });
    expect(detail.kind).toBe("bookkeeping");
    expect(detail.periods).toHaveLength(1);
    expect(detail.tasks[0]?.code).toBe("bank_reconcile");
  });

  it("maps document request rows", () => {
    const request = mapDocumentRequest({
      id: "55555555-5555-5555-5555-555555555555",
      workspaceId: "11111111-1111-1111-1111-111111111111",
      periodId: null,
      taskId: null,
      title: "Bank statements",
      instructions: "Upload latest statements",
      status: "requested",
      dueAt: null,
      attachmentId: null,
      storagePath: null,
      receivedAt: null,
      reviewedAt: null,
      adminNote: "",
      createdAt: "2026-11-06T00:00:00Z",
      updatedAt: "2026-11-06T00:00:00Z",
    });
    expect(request.status).toBe("requested");
  });
});
