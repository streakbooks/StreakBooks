export type AdvisorsEngagementStatus =
  "draft" | "proposed" | "accepted" | "onboarding" | "active" | "paused" | "closed";

export type AdvisorsProposalStatus =
  "draft" | "sent" | "accepted" | "declined" | "expired" | "superseded";

export type AdvisorsAgreementStatus = "draft" | "presented" | "accepted" | "withdrawn";

export type AdvisorsOnboardingTaskStatus =
  "pending" | "in_progress" | "blocked" | "done" | "skipped";

export type AdvisorsBillingInterval = "month" | "year" | "session" | "one_time";

export type AdvisorsEngagement = {
  id: string;
  clientId: string;
  assignedAdvisorId: string | null;
  serviceCode: string;
  planCode: string | null;
  title: string;
  status: AdvisorsEngagementStatus;
  currency: string;
  amountMinor: number;
  billingInterval: AdvisorsBillingInterval | null;
  scopeSummary: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  clientEmail?: string | undefined;
  clientName?: string | undefined;
  clientBusinessName?: string | undefined;
  proposalCount?: number | undefined;
  onboardingDone?: number | undefined;
  onboardingTotal?: number | undefined;
};

export type AdvisorsProposal = {
  id: string;
  engagementId: string;
  versionNumber: number;
  status: AdvisorsProposalStatus;
  publicToken: string;
  title: string;
  summary: string;
  scopeText: string;
  exclusionsText: string;
  serviceCode: string;
  planCode: string | null;
  currency: string;
  amountMinor: number;
  billingInterval: AdvisorsBillingInterval | null;
  pricingSnapshot: Record<string, string | number | boolean | null>;
  validUntil: string | null;
  sentAt: string | null;
  respondedAt: string | null;
  responseNote: string;
  createdAt: string;
  updatedAt: string;
  clientName?: string | undefined;
  clientEmail?: string | undefined;
  clientBusinessName?: string | undefined;
  engagementTitle?: string | undefined;
  agreementToken?: string | undefined;
  agreementId?: string | undefined;
};

export type AdvisorsAgreement = {
  id: string;
  engagementId: string;
  proposalId: string | null;
  versionNumber: number;
  status: AdvisorsAgreementStatus;
  publicToken: string;
  title: string;
  bodyText: string;
  presentedAt: string | null;
  acceptedAt: string | null;
  acceptedName: string | null;
  acceptedEmail: string | null;
  consentAt: string | null;
  createdAt: string;
  updatedAt: string;
  clientName?: string | undefined;
  clientEmail?: string | undefined;
  clientBusinessName?: string | undefined;
  engagementTitle?: string | undefined;
  serviceCode?: string | undefined;
  planCode?: string | null | undefined;
  engagementStatus?: string | undefined;
  subscriptionStarted?: boolean | undefined;
};

export type AdvisorsOnboardingTask = {
  id: string;
  engagementId: string;
  code: string;
  title: string;
  description: string;
  status: AdvisorsOnboardingTaskStatus;
  sortOrder: number;
  requiresDocument: boolean;
  documentLabel: string;
  customerNote: string;
  adminNote: string;
  assignedAdvisorId: string | null;
  dueAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdvisorsEngagementDetail = AdvisorsEngagement & {
  proposals: AdvisorsProposal[];
  agreements: AdvisorsAgreement[];
  onboardingTasks: AdvisorsOnboardingTask[];
};

export type AdvisorsOnboardingBoardItem = AdvisorsEngagement & {
  tasks: AdvisorsOnboardingTask[];
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function asBool(value: unknown): boolean {
  return Boolean(value);
}

function mapSnapshot(raw: unknown): Record<string, string | number | boolean | null> {
  const row = asRecord(raw);
  const out: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(row)) {
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null
    ) {
      out[key] = value;
    } else if (value !== undefined) {
      out[key] = JSON.stringify(value);
    }
  }
  return out;
}

export function mapEngagement(raw: unknown): AdvisorsEngagement {
  const row = asRecord(raw);
  return {
    id: asString(row["id"]),
    clientId: asString(row["clientId"]),
    assignedAdvisorId: asNullableString(row["assignedAdvisorId"]),
    serviceCode: asString(row["serviceCode"]),
    planCode: asNullableString(row["planCode"]),
    title: asString(row["title"]),
    status: asString(row["status"], "draft") as AdvisorsEngagementStatus,
    currency: asString(row["currency"], "USD"),
    amountMinor: asNumber(row["amountMinor"]),
    billingInterval: asNullableString(row["billingInterval"]) as AdvisorsBillingInterval | null,
    scopeSummary: asString(row["scopeSummary"]),
    notes: asString(row["notes"]),
    createdAt: asString(row["createdAt"]),
    updatedAt: asString(row["updatedAt"]),
    clientEmail: asNullableString(row["clientEmail"]) ?? undefined,
    clientName: asNullableString(row["clientName"]) ?? undefined,
    clientBusinessName: asNullableString(row["clientBusinessName"]) ?? undefined,
    proposalCount: row["proposalCount"] === undefined ? undefined : asNumber(row["proposalCount"]),
    onboardingDone:
      row["onboardingDone"] === undefined ? undefined : asNumber(row["onboardingDone"]),
    onboardingTotal:
      row["onboardingTotal"] === undefined ? undefined : asNumber(row["onboardingTotal"]),
  };
}

export function mapProposal(raw: unknown): AdvisorsProposal {
  const row = asRecord(raw);
  return {
    id: asString(row["id"]),
    engagementId: asString(row["engagementId"]),
    versionNumber: asNumber(row["versionNumber"], 1),
    status: asString(row["status"], "draft") as AdvisorsProposalStatus,
    publicToken: asString(row["publicToken"]),
    title: asString(row["title"]),
    summary: asString(row["summary"]),
    scopeText: asString(row["scopeText"]),
    exclusionsText: asString(row["exclusionsText"]),
    serviceCode: asString(row["serviceCode"]),
    planCode: asNullableString(row["planCode"]),
    currency: asString(row["currency"], "USD"),
    amountMinor: asNumber(row["amountMinor"]),
    billingInterval: asNullableString(row["billingInterval"]) as AdvisorsBillingInterval | null,
    pricingSnapshot: mapSnapshot(row["pricingSnapshot"]),
    validUntil: asNullableString(row["validUntil"]),
    sentAt: asNullableString(row["sentAt"]),
    respondedAt: asNullableString(row["respondedAt"]),
    responseNote: asString(row["responseNote"]),
    createdAt: asString(row["createdAt"]),
    updatedAt: asString(row["updatedAt"]),
    clientName: asNullableString(row["clientName"]) ?? undefined,
    clientEmail: asNullableString(row["clientEmail"]) ?? undefined,
    clientBusinessName: asNullableString(row["clientBusinessName"]) ?? undefined,
    engagementTitle: asNullableString(row["engagementTitle"]) ?? undefined,
    agreementToken: asNullableString(row["agreementToken"]) ?? undefined,
    agreementId: asNullableString(row["agreementId"]) ?? undefined,
  };
}

export function mapAgreement(raw: unknown): AdvisorsAgreement {
  const row = asRecord(raw);
  return {
    id: asString(row["id"]),
    engagementId: asString(row["engagementId"]),
    proposalId: asNullableString(row["proposalId"]),
    versionNumber: asNumber(row["versionNumber"], 1),
    status: asString(row["status"], "draft") as AdvisorsAgreementStatus,
    publicToken: asString(row["publicToken"]),
    title: asString(row["title"]),
    bodyText: asString(row["bodyText"]),
    presentedAt: asNullableString(row["presentedAt"]),
    acceptedAt: asNullableString(row["acceptedAt"]),
    acceptedName: asNullableString(row["acceptedName"]),
    acceptedEmail: asNullableString(row["acceptedEmail"]),
    consentAt: asNullableString(row["consentAt"]),
    createdAt: asString(row["createdAt"]),
    updatedAt: asString(row["updatedAt"]),
    clientName: asNullableString(row["clientName"]) ?? undefined,
    clientEmail: asNullableString(row["clientEmail"]) ?? undefined,
    clientBusinessName: asNullableString(row["clientBusinessName"]) ?? undefined,
    engagementTitle: asNullableString(row["engagementTitle"]) ?? undefined,
    serviceCode: asNullableString(row["serviceCode"]) ?? undefined,
    planCode: asNullableString(row["planCode"]),
    engagementStatus: asNullableString(row["engagementStatus"]) ?? undefined,
    subscriptionStarted:
      row["subscriptionStarted"] === undefined ? undefined : asBool(row["subscriptionStarted"]),
  };
}

export function mapOnboardingTask(raw: unknown): AdvisorsOnboardingTask {
  const row = asRecord(raw);
  return {
    id: asString(row["id"]),
    engagementId: asString(row["engagementId"]),
    code: asString(row["code"]),
    title: asString(row["title"]),
    description: asString(row["description"]),
    status: asString(row["status"], "pending") as AdvisorsOnboardingTaskStatus,
    sortOrder: asNumber(row["sortOrder"], 100),
    requiresDocument: asBool(row["requiresDocument"]),
    documentLabel: asString(row["documentLabel"]),
    customerNote: asString(row["customerNote"]),
    adminNote: asString(row["adminNote"]),
    assignedAdvisorId: asNullableString(row["assignedAdvisorId"]),
    dueAt: asNullableString(row["dueAt"]),
    completedAt: asNullableString(row["completedAt"]),
    createdAt: asString(row["createdAt"]),
    updatedAt: asString(row["updatedAt"]),
  };
}

export function mapEngagementDetail(raw: unknown): AdvisorsEngagementDetail {
  const row = asRecord(raw);
  return {
    ...mapEngagement(raw),
    proposals: Array.isArray(row["proposals"]) ? row["proposals"].map(mapProposal) : [],
    agreements: Array.isArray(row["agreements"]) ? row["agreements"].map(mapAgreement) : [],
    onboardingTasks: Array.isArray(row["onboardingTasks"])
      ? row["onboardingTasks"].map(mapOnboardingTask)
      : [],
  };
}

export function mapOnboardingBoardItem(raw: unknown): AdvisorsOnboardingBoardItem {
  const row = asRecord(raw);
  return {
    ...mapEngagement(raw),
    tasks: Array.isArray(row["tasks"]) ? row["tasks"].map(mapOnboardingTask) : [],
  };
}

export function formatAdvisorsMoney(amountMinor: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "USD",
    }).format(amountMinor / 100);
  } catch {
    return `${(amountMinor / 100).toFixed(2)} ${currency || "USD"}`;
  }
}

export function proposalPublicPath(token: string): string {
  return `/advisors/proposal/${token}`;
}

export function agreementPublicPath(token: string): string {
  return `/advisors/agreement/${token}`;
}
