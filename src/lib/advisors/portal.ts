import { mapClient, type AdvisorsClient } from "@/lib/advisors/management";
import { mapAdvisorsSubscription, type AdvisorsSubscription } from "@/lib/advisors/billing";

export type AdvisorsPortalPlan = {
  code: string;
  name: string;
  serviceCode: string;
  summary: string;
  cadence: string;
  inclusions: string[];
  features: string[];
  currency: string;
  amountMinor: number;
  annualAmountMinor: number | null;
  sessionsIncluded: number | null;
};

export type AdvisorsPortalEngagement = {
  id: string;
  title: string;
  status: string;
  serviceCode: string;
  planCode: string | null;
  billingInterval: string | null;
  amountMinor: number;
  currency: string;
  scopeSummary: string;
};

export type AdvisorsPortalAppointment = {
  id: string;
  status: string;
  startsAt: string;
  endsAt: string;
  serviceCode: string | null;
  planCode: string | null;
  manageToken: string;
  notes: string | null;
  advisorName: string | null;
  customerTimezone: string;
};

export type AdvisorsPortalTask = {
  id: string;
  workspaceId: string;
  periodId: string | null;
  code: string;
  title: string;
  description: string;
  status: string;
  dueAt: string | null;
  customerNote: string;
  requiresDocument: boolean;
  workspaceTitle: string;
  kind: string;
};

export type AdvisorsPortalDocument = {
  id: string;
  workspaceId: string;
  title: string;
  instructions: string;
  status: string;
  dueAt: string | null;
  companyId: string | null;
  workspaceTitle: string;
};

export type AdvisorsPortalMessage = {
  id: string;
  authorRole: "customer" | "advisor" | "system" | string;
  body: string;
  createdAt: string;
};

export type AdvisorsPortalNotification = {
  id: string;
  kind: string;
  title: string;
  body: string;
  href: string | null;
  readAt: string | null;
  createdAt: string;
};

export type AdvisorsPortalServiceRequest = {
  id: string;
  kind: "plan_change" | "cancellation" | string;
  status: string;
  details: string;
  preferredPlanCode: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdvisorsPortalHome = {
  client: AdvisorsClient;
  engagement: AdvisorsPortalEngagement | null;
  plan: AdvisorsPortalPlan | null;
  subscription: AdvisorsSubscription | null;
  coachingSessionsCompleted: number;
  upcomingAppointments: AdvisorsPortalAppointment[];
  openTasks: number;
  openDocuments: number;
  unreadNotifications: number;
  calendarOAuth: {
    google: string;
    microsoft: string;
    note: string;
  };
};

export type AdvisorsPortalInvite = {
  id: string;
  clientId: string;
  email: string;
  token: string;
  status: string;
  expiresAt: string;
  createdAt: string;
  link?: string;
  emailed?: boolean;
};

export type AdvisorsBookingReminder = {
  reminderId: string;
  appointmentId: string;
  dueAt: string;
  startsAt: string;
  endsAt: string;
  customerName: string;
  customerEmail: string;
  manageToken: string;
  advisorName: string | null;
  attempts: number;
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

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

export function mapPortalPlan(raw: unknown): AdvisorsPortalPlan | null {
  if (!raw) return null;
  const row = asRecord(raw);
  if (!asString(row["code"])) return null;
  return {
    code: asString(row["code"]),
    name: asString(row["name"]),
    serviceCode: asString(row["serviceCode"]),
    summary: asString(row["summary"]),
    cadence: asString(row["cadence"]),
    inclusions: asStringArray(row["inclusions"]),
    features: asStringArray(row["features"]),
    currency: asString(row["currency"], "USD"),
    amountMinor: asNumber(row["amountMinor"]),
    annualAmountMinor: row["annualAmountMinor"] == null ? null : asNumber(row["annualAmountMinor"]),
    sessionsIncluded: row["sessionsIncluded"] == null ? null : asNumber(row["sessionsIncluded"]),
  };
}

export function mapPortalEngagement(raw: unknown): AdvisorsPortalEngagement | null {
  if (!raw) return null;
  const row = asRecord(raw);
  if (!asString(row["id"])) return null;
  return {
    id: asString(row["id"]),
    title: asString(row["title"]),
    status: asString(row["status"]),
    serviceCode: asString(row["serviceCode"]),
    planCode: asNullableString(row["planCode"]),
    billingInterval: asNullableString(row["billingInterval"]),
    amountMinor: asNumber(row["amountMinor"]),
    currency: asString(row["currency"], "USD"),
    scopeSummary: asString(row["scopeSummary"]),
  };
}

export function mapPortalAppointment(raw: unknown): AdvisorsPortalAppointment {
  const row = asRecord(raw);
  return {
    id: asString(row["id"]),
    status: asString(row["status"]),
    startsAt: asString(row["startsAt"]),
    endsAt: asString(row["endsAt"]),
    serviceCode: asNullableString(row["serviceCode"]),
    planCode: asNullableString(row["planCode"]),
    manageToken: asString(row["manageToken"]),
    notes: asNullableString(row["notes"]),
    advisorName: asNullableString(row["advisorName"]),
    customerTimezone: asString(row["customerTimezone"], "UTC"),
  };
}

export function mapPortalTask(raw: unknown): AdvisorsPortalTask {
  const row = asRecord(raw);
  return {
    id: asString(row["id"]),
    workspaceId: asString(row["workspaceId"]),
    periodId: asNullableString(row["periodId"]),
    code: asString(row["code"]),
    title: asString(row["title"]),
    description: asString(row["description"]),
    status: asString(row["status"]),
    dueAt: asNullableString(row["dueAt"]),
    customerNote: asString(row["customerNote"]),
    requiresDocument: Boolean(row["requiresDocument"]),
    workspaceTitle: asString(row["workspaceTitle"]),
    kind: asString(row["kind"]),
  };
}

export function mapPortalDocument(raw: unknown): AdvisorsPortalDocument {
  const row = asRecord(raw);
  return {
    id: asString(row["id"]),
    workspaceId: asString(row["workspaceId"]),
    title: asString(row["title"]),
    instructions: asString(row["instructions"]),
    status: asString(row["status"]),
    dueAt: asNullableString(row["dueAt"]),
    companyId: asNullableString(row["companyId"]),
    workspaceTitle: asString(row["workspaceTitle"]),
  };
}

export function mapPortalMessage(raw: unknown): AdvisorsPortalMessage {
  const row = asRecord(raw);
  return {
    id: asString(row["id"]),
    authorRole: asString(row["authorRole"]),
    body: asString(row["body"]),
    createdAt: asString(row["createdAt"]),
  };
}

export function mapPortalNotification(raw: unknown): AdvisorsPortalNotification {
  const row = asRecord(raw);
  return {
    id: asString(row["id"]),
    kind: asString(row["kind"]),
    title: asString(row["title"]),
    body: asString(row["body"]),
    href: asNullableString(row["href"]),
    readAt: asNullableString(row["readAt"]),
    createdAt: asString(row["createdAt"]),
  };
}

export function mapPortalServiceRequest(raw: unknown): AdvisorsPortalServiceRequest {
  const row = asRecord(raw);
  return {
    id: asString(row["id"]),
    kind: asString(row["kind"]),
    status: asString(row["status"]),
    details: asString(row["details"]),
    preferredPlanCode: asNullableString(row["preferredPlanCode"]),
    createdAt: asString(row["createdAt"]),
    updatedAt: asString(row["updatedAt"]),
  };
}

export function mapPortalHome(raw: unknown): AdvisorsPortalHome {
  const row = asRecord(raw);
  const oauth = asRecord(row["calendarOAuth"]);
  return {
    client: mapClient(row["client"]),
    engagement: mapPortalEngagement(row["engagement"]),
    plan: mapPortalPlan(row["plan"]),
    subscription: row["subscription"] ? mapAdvisorsSubscription(row["subscription"]) : null,
    coachingSessionsCompleted: asNumber(row["coachingSessionsCompleted"]),
    upcomingAppointments: Array.isArray(row["upcomingAppointments"])
      ? row["upcomingAppointments"].map(mapPortalAppointment)
      : [],
    openTasks: asNumber(row["openTasks"]),
    openDocuments: asNumber(row["openDocuments"]),
    unreadNotifications: asNumber(row["unreadNotifications"]),
    calendarOAuth: {
      google: asString(oauth["google"], "not_configured"),
      microsoft: asString(oauth["microsoft"], "not_configured"),
      note: asString(
        oauth["note"],
        "Native Advisors booking is the source of truth. External calendar OAuth is optional and not enabled.",
      ),
    },
  };
}

export function mapPortalInvite(raw: unknown): AdvisorsPortalInvite {
  const row = asRecord(raw);
  return {
    id: asString(row["id"]),
    clientId: asString(row["clientId"]),
    email: asString(row["email"]),
    token: asString(row["token"]),
    status: asString(row["status"]),
    expiresAt: asString(row["expiresAt"]),
    createdAt: asString(row["createdAt"]),
  };
}

export function mapBookingReminder(raw: unknown): AdvisorsBookingReminder {
  const row = asRecord(raw);
  return {
    reminderId: asString(row["reminderId"]),
    appointmentId: asString(row["appointmentId"]),
    dueAt: asString(row["dueAt"]),
    startsAt: asString(row["startsAt"]),
    endsAt: asString(row["endsAt"]),
    customerName: asString(row["customerName"]),
    customerEmail: asString(row["customerEmail"]),
    manageToken: asString(row["manageToken"]),
    advisorName: asNullableString(row["advisorName"]),
    attempts: asNumber(row["attempts"]),
  };
}

export function formatMinorAmount(amountMinor: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "USD",
    }).format(amountMinor / 100);
  } catch {
    return `${(amountMinor / 100).toFixed(2)} ${currency}`;
  }
}
