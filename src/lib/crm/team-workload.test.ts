import { describe, expect, it } from "vitest";
import { buildCrmTeamWorkload } from "@/lib/crm/team-workload";

describe("buildCrmTeamWorkload", () => {
  it("counts owned open leads and opportunities per member", () => {
    const rows = buildCrmTeamWorkload({
      members: [
        {
          userId: "u1",
          fullName: "Ada",
          email: "ada@example.com",
          role: "admin",
          status: "active",
          isYou: true,
        },
        {
          userId: "u2",
          fullName: "Bob",
          email: "bob@example.com",
          role: "member",
          status: "active",
          isYou: false,
        },
      ],
      leads: [
        { ownerUserId: "u1" },
        { ownerUserId: "u1" },
        { ownerUserId: null },
      ],
      opportunities: [{ ownerUserId: "u2" }, { ownerUserId: "u1" }],
    });
    expect(rows[0]?.openLeadCount).toBe(2);
    expect(rows[0]?.openOpportunityCount).toBe(1);
    expect(rows[1]?.openLeadCount).toBe(0);
    expect(rows[1]?.openOpportunityCount).toBe(1);
  });
});
