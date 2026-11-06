export type AdvisorsWorkspaceKind = "bookkeeping" | "coaching";
export type AdvisorsWorkspaceStatus = "active" | "paused" | "closed";
export type AdvisorsPeriodStatus = "open" | "in_review" | "completed" | "cancelled";
export type AdvisorsDeliveryTaskStatus = "pending" | "in_progress" | "blocked" | "done" | "skipped";
export type AdvisorsDocumentRequestStatus = "requested" | "received" | "reviewed" | "cancelled";

export type AdvisorsWorkspace = {
  id: string;
  engagementId: string;
  kind: AdvisorsWorkspaceKind;
  status: AdvisorsWorkspaceStatus;
  assignedAdvisorId: string | null;
  title: string;
  cadence: string;
  objectives: string;
  createdAt: string;
  updatedAt: string;
  engagementTitle?: string | undefined;
  engagementStatus?: string | undefined;
  clientEmail?: string | undefined;
  clientName?: string | undefined;
  openPeriods?: number | undefined;
  openTasks?: number | undefined;
  openDocuments?: number | undefined;
};

export type AdvisorsWorkPeriod = {
  id: string;
  workspaceId: string;
  label: string;
  periodStart: string | null;
  periodEnd: string | null;
  sessionAt: string | null;
  status: AdvisorsPeriodStatus;
  summary: string;
  createdAt: string;
  updatedAt: string;
};

export type AdvisorsDeliveryTask = {
  id: string;
  workspaceId: string;
  periodId: string;
  code: string;
  title: string;
  description: string;
  status: AdvisorsDeliveryTaskStatus;
  sortOrder: number;
  requiresDocument: boolean;
  documentLabel: string;
  assignedAdvisorId: string | null;
  dueAt: string | null;
  completedAt: string | null;
  adminNote: string;
  customerNote: string;
  createdAt: string;
  updatedAt: string;
};

export type AdvisorsDocumentRequest = {
  id: string;
  workspaceId: string;
  periodId: string | null;
  taskId: string | null;
  title: string;
  instructions: string;
  status: AdvisorsDocumentRequestStatus;
  dueAt: string | null;
  attachmentId: string | null;
  storagePath: string | null;
  receivedAt: string | null;
  reviewedAt: string | null;
  adminNote: string;
  createdAt: string;
  updatedAt: string;
  workspaceTitle?: string | undefined;
  clientEmail?: string | undefined;
  clientName?: string | undefined;
};

export type AdvisorsWorkspaceNote = {
  id: string;
  workspaceId: string;
  periodId: string | null;
  authorAdvisorId: string | null;
  visibility: "internal" | "customer";
  body: string;
  createdAt: string;
};

export type AdvisorsWorkspaceDetail = AdvisorsWorkspace & {
  clientBusinessName?: string | undefined;
  companyId?: string | null | undefined;
  periods: AdvisorsWorkPeriod[];
  tasks: AdvisorsDeliveryTask[];
  documentRequests: AdvisorsDocumentRequest[];
  notes: AdvisorsWorkspaceNote[];
};

export type AdvisorsDeliveryCandidate = {
  id: string;
  title: string;
  status: string;
  serviceCode: string;
  clientId: string;
  clientEmail: string | null;
  clientName: string | null;
  assignedAdvisorId: string | null;
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

export function mapWorkspace(raw: unknown): AdvisorsWorkspace {
  const row = asRecord(raw);
  return {
    id: asString(row["id"]),
    engagementId: asString(row["engagementId"]),
    kind: asString(row["kind"], "bookkeeping") as AdvisorsWorkspaceKind,
    status: asString(row["status"], "active") as AdvisorsWorkspaceStatus,
    assignedAdvisorId: asNullableString(row["assignedAdvisorId"]),
    title: asString(row["title"]),
    cadence: asString(row["cadence"], "monthly"),
    objectives: asString(row["objectives"]),
    createdAt: asString(row["createdAt"]),
    updatedAt: asString(row["updatedAt"]),
    engagementTitle: asNullableString(row["engagementTitle"]) ?? undefined,
    engagementStatus: asNullableString(row["engagementStatus"]) ?? undefined,
    clientEmail: asNullableString(row["clientEmail"]) ?? undefined,
    clientName: asNullableString(row["clientName"]) ?? undefined,
    openPeriods: row["openPeriods"] === undefined ? undefined : asNumber(row["openPeriods"]),
    openTasks: row["openTasks"] === undefined ? undefined : asNumber(row["openTasks"]),
    openDocuments: row["openDocuments"] === undefined ? undefined : asNumber(row["openDocuments"]),
  };
}

export function mapWorkPeriod(raw: unknown): AdvisorsWorkPeriod {
  const row = asRecord(raw);
  return {
    id: asString(row["id"]),
    workspaceId: asString(row["workspaceId"]),
    label: asString(row["label"]),
    periodStart: asNullableString(row["periodStart"]),
    periodEnd: asNullableString(row["periodEnd"]),
    sessionAt: asNullableString(row["sessionAt"]),
    status: asString(row["status"], "open") as AdvisorsPeriodStatus,
    summary: asString(row["summary"]),
    createdAt: asString(row["createdAt"]),
    updatedAt: asString(row["updatedAt"]),
  };
}

export function mapDeliveryTask(raw: unknown): AdvisorsDeliveryTask {
  const row = asRecord(raw);
  return {
    id: asString(row["id"]),
    workspaceId: asString(row["workspaceId"]),
    periodId: asString(row["periodId"]),
    code: asString(row["code"]),
    title: asString(row["title"]),
    description: asString(row["description"]),
    status: asString(row["status"], "pending") as AdvisorsDeliveryTaskStatus,
    sortOrder: asNumber(row["sortOrder"], 100),
    requiresDocument: asBool(row["requiresDocument"]),
    documentLabel: asString(row["documentLabel"]),
    assignedAdvisorId: asNullableString(row["assignedAdvisorId"]),
    dueAt: asNullableString(row["dueAt"]),
    completedAt: asNullableString(row["completedAt"]),
    adminNote: asString(row["adminNote"]),
    customerNote: asString(row["customerNote"]),
    createdAt: asString(row["createdAt"]),
    updatedAt: asString(row["updatedAt"]),
  };
}

export function mapDocumentRequest(raw: unknown): AdvisorsDocumentRequest {
  const row = asRecord(raw);
  return {
    id: asString(row["id"]),
    workspaceId: asString(row["workspaceId"]),
    periodId: asNullableString(row["periodId"]),
    taskId: asNullableString(row["taskId"]),
    title: asString(row["title"]),
    instructions: asString(row["instructions"]),
    status: asString(row["status"], "requested") as AdvisorsDocumentRequestStatus,
    dueAt: asNullableString(row["dueAt"]),
    attachmentId: asNullableString(row["attachmentId"]),
    storagePath: asNullableString(row["storagePath"]),
    receivedAt: asNullableString(row["receivedAt"]),
    reviewedAt: asNullableString(row["reviewedAt"]),
    adminNote: asString(row["adminNote"]),
    createdAt: asString(row["createdAt"]),
    updatedAt: asString(row["updatedAt"]),
    workspaceTitle: asNullableString(row["workspaceTitle"]) ?? undefined,
    clientEmail: asNullableString(row["clientEmail"]) ?? undefined,
    clientName: asNullableString(row["clientName"]) ?? undefined,
  };
}

export function mapWorkspaceNote(raw: unknown): AdvisorsWorkspaceNote {
  const row = asRecord(raw);
  return {
    id: asString(row["id"]),
    workspaceId: asString(row["workspaceId"]),
    periodId: asNullableString(row["periodId"]),
    authorAdvisorId: asNullableString(row["authorAdvisorId"]),
    visibility: asString(row["visibility"], "internal") as "internal" | "customer",
    body: asString(row["body"]),
    createdAt: asString(row["createdAt"]),
  };
}

export function mapWorkspaceDetail(raw: unknown): AdvisorsWorkspaceDetail {
  const row = asRecord(raw);
  return {
    ...mapWorkspace(raw),
    clientBusinessName: asNullableString(row["clientBusinessName"]) ?? undefined,
    companyId: asNullableString(row["companyId"]),
    periods: Array.isArray(row["periods"]) ? row["periods"].map(mapWorkPeriod) : [],
    tasks: Array.isArray(row["tasks"]) ? row["tasks"].map(mapDeliveryTask) : [],
    documentRequests: Array.isArray(row["documentRequests"])
      ? row["documentRequests"].map(mapDocumentRequest)
      : [],
    notes: Array.isArray(row["notes"]) ? row["notes"].map(mapWorkspaceNote) : [],
  };
}

export function mapDeliveryCandidate(raw: unknown): AdvisorsDeliveryCandidate {
  const row = asRecord(raw);
  return {
    id: asString(row["id"]),
    title: asString(row["title"]),
    status: asString(row["status"]),
    serviceCode: asString(row["serviceCode"]),
    clientId: asString(row["clientId"]),
    clientEmail: asNullableString(row["clientEmail"]),
    clientName: asNullableString(row["clientName"]),
    assignedAdvisorId: asNullableString(row["assignedAdvisorId"]),
  };
}
