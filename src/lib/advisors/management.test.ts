import { describe, expect, it } from "vitest";
import {
  mapClient,
  mapConversationDetail,
  mapInquiry,
  mapOverview,
  mapStaff,
  staffLabel,
} from "@/lib/advisors/management";

describe("advisors management mappers", () => {
  it("maps inquiry rows", () => {
    const inquiry = mapInquiry({
      id: "11111111-1111-1111-1111-111111111111",
      conversationId: null,
      serviceCode: "bookkeeping",
      planCode: "starter",
      name: "Ada",
      email: "ada@example.com",
      businessName: "Ada Co",
      phone: null,
      notes: null,
      adminNotes: "Follow up",
      source: "chat",
      status: "new",
      assignedAdvisorId: null,
      createdAt: "2026-11-06T00:00:00Z",
      updatedAt: "2026-11-06T00:00:00Z",
    });
    expect(inquiry.email).toBe("ada@example.com");
    expect(inquiry.status).toBe("new");
  });

  it("maps conversation detail with messages", () => {
    const detail = mapConversationDetail({
      id: "22222222-2222-2222-2222-222222222222",
      serviceCode: "coaching",
      status: "handed_off",
      recommendedPlanCode: null,
      messageCount: 2,
      visitorName: "Sam",
      visitorEmail: "sam@example.com",
      assignedAdvisorId: null,
      adminNotes: "",
      createdAt: "2026-11-06T00:00:00Z",
      lastMessageAt: "2026-11-06T01:00:00Z",
      updatedAt: "2026-11-06T01:00:00Z",
      qualification: { employees: "1-5" },
      messages: [
        { id: "m1", role: "assistant", content: "Hello", createdAt: "2026-11-06T00:00:00Z" },
        { id: "m2", role: "visitor", content: "Hi", createdAt: "2026-11-06T00:01:00Z" },
      ],
    });
    expect(detail.messages).toHaveLength(2);
    expect(detail.qualification["employees"]).toBe("1-5");
  });

  it("maps client, staff and overview", () => {
    const client = mapClient({
      id: "33333333-3333-3333-3333-333333333333",
      email: "client@example.com",
      name: "Client",
      businessName: "Client Ltd",
      phone: null,
      status: "active",
      primaryServiceCode: "bookkeeping",
      assignedAdvisorId: null,
      sourceLeadId: null,
      sourceAppointmentId: null,
      companyId: null,
      linkedUserId: null,
      notes: "",
      createdAt: "2026-11-06T00:00:00Z",
      updatedAt: "2026-11-06T00:00:00Z",
    });
    const staff = mapStaff({
      id: "44444444-4444-4444-4444-444444444444",
      displayName: "Jordan",
      email: "jordan@example.com",
      timezone: "Europe/London",
      isActive: true,
      createdAt: "2026-11-06T00:00:00Z",
      updatedAt: "2026-11-06T00:00:00Z",
    });
    const overview = mapOverview({
      newInquiries: 3,
      openConversations: 2,
      handedOffConversations: 1,
      pendingConsultations: 4,
      upcomingAppointments: 2,
      activeClients: 5,
      prospectClients: 1,
      activeAdvisors: 1,
      openProposals: 2,
      onboardingEngagements: 1,
      pendingBilling: 1,
      activeBilling: 0,
      activeWorkspaces: 2,
      openDeliveryTasks: 4,
      openDocumentRequests: 3,
      linkedPortalClients: 2,
      openPortalRequests: 1,
      pendingReminders: 3,
      recentInquiries: [],
      upcoming: [],
    });
    expect(client.status).toBe("active");
    expect(client.linkedUserId).toBeNull();
    expect(staff.displayName).toBe("Jordan");
    expect(overview.newInquiries).toBe(3);
    expect(overview.openProposals).toBe(2);
    expect(overview.pendingBilling).toBe(1);
    expect(overview.activeWorkspaces).toBe(2);
    expect(overview.linkedPortalClients).toBe(2);
    expect(overview.pendingReminders).toBe(3);
    expect(staffLabel([staff], staff.id)).toBe("Jordan");
    expect(staffLabel([staff], null)).toBe("Unassigned");
  });
});
