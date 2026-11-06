import { describe, expect, it } from "vitest";
import {
  formatMinorAmount,
  mapPortalHome,
  mapPortalInvite,
  mapPortalNotification,
} from "@/lib/advisors/portal";

describe("advisors portal mappers", () => {
  it("maps portal home with plan inclusions and calendar oauth stub", () => {
    const home = mapPortalHome({
      client: {
        id: "11111111-1111-1111-1111-111111111111",
        email: "ada@example.com",
        name: "Ada",
        businessName: "Ada Books",
        phone: null,
        status: "active",
        primaryServiceCode: "bookkeeping",
        assignedAdvisorId: null,
        sourceLeadId: null,
        sourceAppointmentId: null,
        companyId: null,
        linkedUserId: "22222222-2222-2222-2222-222222222222",
        notes: "",
        createdAt: "2026-11-06T00:00:00Z",
        updatedAt: "2026-11-06T00:00:00Z",
      },
      engagement: {
        id: "33333333-3333-3333-3333-333333333333",
        title: "Books",
        status: "active",
        serviceCode: "bookkeeping",
        planCode: "growth_books",
        billingInterval: "month",
        amountMinor: 19900,
        currency: "USD",
        scopeSummary: "Monthly books",
      },
      plan: {
        code: "growth_books",
        name: "Growth Books",
        serviceCode: "bookkeeping",
        summary: "Growing teams",
        cadence: "month",
        inclusions: ["Reconciliations", "Reports"],
        features: ["Priority chat"],
        currency: "USD",
        amountMinor: 19900,
        annualAmountMinor: 199000,
        sessionsIncluded: null,
      },
      subscription: null,
      coachingSessionsCompleted: 0,
      upcomingAppointments: [],
      openTasks: 2,
      openDocuments: 1,
      unreadNotifications: 3,
      calendarOAuth: {
        google: "not_configured",
        microsoft: "not_configured",
        note: "Native booking only",
      },
    });

    expect(home.client.linkedUserId).toBe("22222222-2222-2222-2222-222222222222");
    expect(home.plan?.inclusions).toEqual(["Reconciliations", "Reports"]);
    expect(home.openTasks).toBe(2);
    expect(home.calendarOAuth.google).toBe("not_configured");
  });

  it("maps invite and notification rows", () => {
    const invite = mapPortalInvite({
      id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      clientId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      email: "ada@example.com",
      token: "tok",
      status: "pending",
      expiresAt: "2026-11-20T00:00:00Z",
      createdAt: "2026-11-06T00:00:00Z",
    });
    const note = mapPortalNotification({
      id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
      kind: "portal_welcome",
      title: "Welcome",
      body: "Linked",
      href: "/advisors-portal",
      readAt: null,
      createdAt: "2026-11-06T00:00:00Z",
    });
    expect(invite.email).toBe("ada@example.com");
    expect(note.kind).toBe("portal_welcome");
    expect(formatMinorAmount(19900, "USD")).toContain("199");
  });
});
