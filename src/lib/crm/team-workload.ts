/** Aggregate CRM ownership counts per company member. */

export type CrmTeamMemberInput = {
  userId: string;
  fullName: string;
  email: string;
  role: string;
  status: string;
  isYou: boolean;
};

export type CrmOwnerCountInput = {
  ownerUserId: string | null;
};

export type CrmTeamWorkloadRow = {
  userId: string;
  fullName: string;
  email: string;
  role: string;
  status: string;
  isYou: boolean;
  openLeadCount: number;
  openOpportunityCount: number;
};

export function buildCrmTeamWorkload(input: {
  members: CrmTeamMemberInput[];
  leads: CrmOwnerCountInput[];
  opportunities: CrmOwnerCountInput[];
}): CrmTeamWorkloadRow[] {
  const leadCounts = new Map<string, number>();
  const oppCounts = new Map<string, number>();
  for (const lead of input.leads) {
    if (!lead.ownerUserId) continue;
    leadCounts.set(lead.ownerUserId, (leadCounts.get(lead.ownerUserId) ?? 0) + 1);
  }
  for (const opp of input.opportunities) {
    if (!opp.ownerUserId) continue;
    oppCounts.set(opp.ownerUserId, (oppCounts.get(opp.ownerUserId) ?? 0) + 1);
  }
  return input.members.map((member) => ({
    userId: member.userId,
    fullName: member.fullName,
    email: member.email,
    role: member.role,
    status: member.status,
    isYou: member.isYou,
    openLeadCount: leadCounts.get(member.userId) ?? 0,
    openOpportunityCount: oppCounts.get(member.userId) ?? 0,
  }));
}
