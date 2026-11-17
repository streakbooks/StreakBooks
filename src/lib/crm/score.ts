/** Deterministic LinkBooks CRM lead score (mirrors score_crm_lead SQL). Max 100. */
export type LeadScoreInput = {
  email?: string | null;
  phone?: string | null;
  organizationName?: string | null;
  sourceId?: string | null;
  estimatedValueMinor?: number;
  ownerUserId?: string | null;
  status?: string;
};

export type LeadScoreReason = { code: string; points: number; detail: string };

export function computeCrmLeadScore(input: LeadScoreInput): {
  score: number;
  reasons: LeadScoreReason[];
} {
  let score = 0;
  const reasons: LeadScoreReason[] = [];
  if (input.email) {
    score += 20;
    reasons.push({ code: "email", points: 20, detail: "Email present" });
  }
  if (input.phone) {
    score += 10;
    reasons.push({ code: "phone", points: 10, detail: "Phone present" });
  }
  if (input.organizationName?.trim()) {
    score += 15;
    reasons.push({ code: "organization", points: 15, detail: "Organisation named" });
  }
  if (input.sourceId) {
    score += 10;
    reasons.push({ code: "source", points: 10, detail: "Lead source set" });
  }
  const value = input.estimatedValueMinor ?? 0;
  if (value >= 100000) {
    score += 20;
    reasons.push({ code: "value_high", points: 20, detail: "Estimated value ≥ 1000.00" });
  } else if (value >= 10000) {
    score += 10;
    reasons.push({ code: "value_mid", points: 10, detail: "Estimated value ≥ 100.00" });
  }
  if (input.ownerUserId) {
    score += 10;
    reasons.push({ code: "owner", points: 10, detail: "Owner assigned" });
  }
  if (input.status === "qualified") {
    score += 15;
    reasons.push({ code: "qualified", points: 15, detail: "Status qualified" });
  } else if (input.status === "contacted") {
    score += 5;
    reasons.push({ code: "contacted", points: 5, detail: "Status contacted" });
  }
  return { score: Math.min(100, score), reasons };
}
