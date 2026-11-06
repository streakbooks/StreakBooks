export type AdvisorsInquiryStatus = "new" | "contacted" | "qualified" | "closed";
export type AdvisorsConversationStatus = "open" | "closed" | "handed_off";
export type AdvisorsClientStatus = "prospect" | "active" | "paused" | "churned";

export type AdvisorsInquiry = {
  id: string;
  conversationId: string | null;
  serviceCode: string;
  planCode: string | null;
  name: string | null;
  email: string | null;
  businessName: string | null;
  phone: string | null;
  notes: string | null;
  adminNotes: string;
  source: string;
  status: AdvisorsInquiryStatus;
  assignedAdvisorId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdvisorsConversationSummary = {
  id: string;
  serviceCode: string;
  status: AdvisorsConversationStatus;
  recommendedPlanCode: string | null;
  messageCount: number;
  visitorName: string | null;
  visitorEmail: string | null;
  assignedAdvisorId: string | null;
  adminNotes: string;
  createdAt: string;
  lastMessageAt: string | null;
  updatedAt: string;
};

export type AdvisorsConversationMessage = {
  id: string;
  role: string;
  content: string;
  createdAt: string;
};

export type AdvisorsQualificationValue = string | number | boolean | null;

export type AdvisorsConversationDetail = AdvisorsConversationSummary & {
  qualification: Record<string, AdvisorsQualificationValue>;
  messages: AdvisorsConversationMessage[];
};

export type AdvisorsClient = {
  id: string;
  email: string;
  name: string;
  businessName: string;
  phone: string | null;
  status: AdvisorsClientStatus;
  primaryServiceCode: string | null;
  assignedAdvisorId: string | null;
  sourceLeadId: string | null;
  sourceAppointmentId: string | null;
  companyId: string | null;
  linkedUserId: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type AdvisorsStaffMember = {
  id: string;
  displayName: string;
  email: string | null;
  timezone: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AdvisorsOverview = {
  newInquiries: number;
  openConversations: number;
  handedOffConversations: number;
  pendingConsultations: number;
  upcomingAppointments: number;
  activeClients: number;
  prospectClients: number;
  activeAdvisors: number;
  openProposals: number;
  onboardingEngagements: number;
  pendingBilling: number;
  activeBilling: number;
  activeWorkspaces: number;
  openDeliveryTasks: number;
  openDocumentRequests: number;
  linkedPortalClients: number;
  openPortalRequests: number;
  pendingReminders: number;
  recentInquiries: AdvisorsInquiry[];
  upcoming: Array<{
    id: string;
    status: string;
    startsAt: string;
    endsAt: string;
    customerName: string;
    customerEmail: string;
    businessName: string;
    serviceCode: string | null;
  }>;
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

export function mapInquiry(raw: unknown): AdvisorsInquiry {
  const row = asRecord(raw);
  return {
    id: asString(row["id"]),
    conversationId: asNullableString(row["conversationId"]),
    serviceCode: asString(row["serviceCode"]),
    planCode: asNullableString(row["planCode"]),
    name: asNullableString(row["name"]),
    email: asNullableString(row["email"]),
    businessName: asNullableString(row["businessName"]),
    phone: asNullableString(row["phone"]),
    notes: asNullableString(row["notes"]),
    adminNotes: asString(row["adminNotes"]),
    source: asString(row["source"], "chat"),
    status: asString(row["status"], "new") as AdvisorsInquiryStatus,
    assignedAdvisorId: asNullableString(row["assignedAdvisorId"]),
    createdAt: asString(row["createdAt"]),
    updatedAt: asString(row["updatedAt"]),
  };
}

export function mapConversationSummary(raw: unknown): AdvisorsConversationSummary {
  const row = asRecord(raw);
  return {
    id: asString(row["id"]),
    serviceCode: asString(row["serviceCode"]),
    status: asString(row["status"], "open") as AdvisorsConversationStatus,
    recommendedPlanCode: asNullableString(row["recommendedPlanCode"]),
    messageCount: asNumber(row["messageCount"]),
    visitorName: asNullableString(row["visitorName"]),
    visitorEmail: asNullableString(row["visitorEmail"]),
    assignedAdvisorId: asNullableString(row["assignedAdvisorId"]),
    adminNotes: asString(row["adminNotes"]),
    createdAt: asString(row["createdAt"]),
    lastMessageAt: asNullableString(row["lastMessageAt"]),
    updatedAt: asString(row["updatedAt"]),
  };
}

function mapQualification(raw: unknown): Record<string, AdvisorsQualificationValue> {
  const row = asRecord(raw);
  const out: Record<string, AdvisorsQualificationValue> = {};
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

export function mapConversationDetail(raw: unknown): AdvisorsConversationDetail {
  const row = asRecord(raw);
  const messages = Array.isArray(row["messages"])
    ? row["messages"].map((item) => {
        const message = asRecord(item);
        return {
          id: asString(message["id"]),
          role: asString(message["role"]),
          content: asString(message["content"]),
          createdAt: asString(message["createdAt"]),
        };
      })
    : [];
  return {
    ...mapConversationSummary(raw),
    qualification: mapQualification(row["qualification"]),
    messages,
  };
}

export function mapClient(raw: unknown): AdvisorsClient {
  const row = asRecord(raw);
  return {
    id: asString(row["id"]),
    email: asString(row["email"]),
    name: asString(row["name"]),
    businessName: asString(row["businessName"]),
    phone: asNullableString(row["phone"]),
    status: asString(row["status"], "prospect") as AdvisorsClientStatus,
    primaryServiceCode: asNullableString(row["primaryServiceCode"]),
    assignedAdvisorId: asNullableString(row["assignedAdvisorId"]),
    sourceLeadId: asNullableString(row["sourceLeadId"]),
    sourceAppointmentId: asNullableString(row["sourceAppointmentId"]),
    companyId: asNullableString(row["companyId"]),
    linkedUserId: asNullableString(row["linkedUserId"]),
    notes: asString(row["notes"]),
    createdAt: asString(row["createdAt"]),
    updatedAt: asString(row["updatedAt"]),
  };
}

export function mapStaff(raw: unknown): AdvisorsStaffMember {
  const row = asRecord(raw);
  return {
    id: asString(row["id"]),
    displayName: asString(row["displayName"]),
    email: asNullableString(row["email"]),
    timezone: asString(row["timezone"], "UTC"),
    isActive: Boolean(row["isActive"]),
    createdAt: asString(row["createdAt"]),
    updatedAt: asString(row["updatedAt"]),
  };
}

export function mapOverview(raw: unknown): AdvisorsOverview {
  const row = asRecord(raw);
  return {
    newInquiries: asNumber(row["newInquiries"]),
    openConversations: asNumber(row["openConversations"]),
    handedOffConversations: asNumber(row["handedOffConversations"]),
    pendingConsultations: asNumber(row["pendingConsultations"]),
    upcomingAppointments: asNumber(row["upcomingAppointments"]),
    activeClients: asNumber(row["activeClients"]),
    prospectClients: asNumber(row["prospectClients"]),
    activeAdvisors: asNumber(row["activeAdvisors"]),
    openProposals: asNumber(row["openProposals"]),
    onboardingEngagements: asNumber(row["onboardingEngagements"]),
    pendingBilling: asNumber(row["pendingBilling"]),
    activeBilling: asNumber(row["activeBilling"]),
    activeWorkspaces: asNumber(row["activeWorkspaces"]),
    openDeliveryTasks: asNumber(row["openDeliveryTasks"]),
    openDocumentRequests: asNumber(row["openDocumentRequests"]),
    linkedPortalClients: asNumber(row["linkedPortalClients"]),
    openPortalRequests: asNumber(row["openPortalRequests"]),
    pendingReminders: asNumber(row["pendingReminders"]),
    recentInquiries: Array.isArray(row["recentInquiries"])
      ? row["recentInquiries"].map(mapInquiry)
      : [],
    upcoming: Array.isArray(row["upcoming"])
      ? row["upcoming"].map((item) => {
          const appointment = asRecord(item);
          return {
            id: asString(appointment["id"]),
            status: asString(appointment["status"]),
            startsAt: asString(appointment["startsAt"]),
            endsAt: asString(appointment["endsAt"]),
            customerName: asString(appointment["customerName"]),
            customerEmail: asString(appointment["customerEmail"]),
            businessName: asString(appointment["businessName"]),
            serviceCode: asNullableString(appointment["serviceCode"]),
          };
        })
      : [],
  };
}

export function staffLabel(
  staff: AdvisorsStaffMember[],
  advisorId: string | null | undefined,
): string {
  if (!advisorId) return "Unassigned";
  const match = staff.find((item) => item.id === advisorId);
  return match?.displayName ?? "Unknown advisor";
}
