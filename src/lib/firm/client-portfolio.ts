import type { FirmClientProfile, FirmClientStatus } from "./client-profiles.functions";

export type FirmClientRow = {
  id: string;
  company_id: string;
  access_level: string;
  companies: { name: string } | null;
};

export const STATUS_LABELS: Record<FirmClientStatus, string> = {
  onboarding: "Onboarding",
  active: "Active",
  on_hold: "On hold",
  offboarding: "Offboarding",
  archived: "Archived in practice",
};

export type FirmClientSort =
  | "name"
  | "name_desc"
  | "review"
  | "review_desc"
  | "status"
  | "service";
export type FirmClientReviewFilter = "all" | "due" | "upcoming" | "unscheduled";
export type FirmClientColumn =
  | "status"
  | "contact"
  | "email"
  | "service"
  | "industry"
  | "tags"
  | "access"
  | "review";

export const FIRM_CLIENT_COLUMNS: { id: FirmClientColumn; label: string }[] = [
  { id: "status", label: "Status" },
  { id: "contact", label: "Primary contact" },
  { id: "email", label: "Contact email" },
  { id: "service", label: "Primary service" },
  { id: "industry", label: "Industry" },
  { id: "tags", label: "Tags" },
  { id: "access", label: "Access" },
  { id: "review", label: "Next review" },
];
export const DEFAULT_FIRM_CLIENT_COLUMNS: FirmClientColumn[] = [
  "status",
  "contact",
  "service",
  "access",
  "review",
];

/** Client name and actions are fixed. Only column identifiers, never client data, are saved. */
export function normalizeFirmClientColumns(value: unknown): FirmClientColumn[] {
  if (!Array.isArray(value)) return [...DEFAULT_FIRM_CLIENT_COLUMNS];
  const allowed = new Set<string>(FIRM_CLIENT_COLUMNS.map((column) => column.id));
  return [
    ...new Set(
      value.filter((item): item is FirmClientColumn => typeof item === "string" && allowed.has(item)),
    ),
  ];
}

export function toggleFirmClientColumn(
  columns: FirmClientColumn[],
  column: FirmClientColumn,
  visible: boolean,
): FirmClientColumn[] {
  return normalizeFirmClientColumns(
    visible ? [...columns, column] : columns.filter((item) => item !== column),
  );
}

/** Use the user's local calendar day, not UTC (which can differ near midnight). */
export function localFirmDate(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

export function firmClientReviewState(
  date: string | null | undefined,
  today: string,
): Exclude<FirmClientReviewFilter, "all"> {
  if (!date) return "unscheduled";
  return date <= today ? "due" : "upcoming";
}

export function getFirmClientName(row: FirmClientRow): string {
  return row.companies?.name ?? "Restricted client";
}

export function filterFirmClients(
  clients: FirmClientRow[],
  profiles: FirmClientProfile[],
  query: string,
  status: FirmClientStatus | "all",
  options: { review?: FirmClientReviewFilter; sort?: FirmClientSort; today?: string } = {},
): FirmClientRow[] {
  const profilesByCompany = new Map(profiles.map((profile) => [profile.company_id, profile]));
  const term = query.trim().toLocaleLowerCase();
  const today = options.today ?? localFirmDate();
  const review = options.review ?? "all";
  const sort = options.sort ?? "name";
  const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });
  const nameCompare = (a: FirmClientRow, b: FirmClientRow) =>
    collator.compare(getFirmClientName(a), getFirmClientName(b)) || collator.compare(a.id, b.id);

  return clients
    .filter((client) => {
      const profile = profilesByCompany.get(client.company_id);
      const currentStatus = profile?.status ?? "active";
      if (status !== "all" && status !== currentStatus) return false;
      if (
        review !== "all" &&
        firmClientReviewState(profile?.next_review_date, today) !== review
      )
        return false;
      if (!term) return true;
      return [
        client.companies?.name ?? "",
        client.access_level,
        profile?.primary_contact_name ?? "",
        profile?.primary_contact_email ?? "",
        profile?.industry ?? "",
        profile?.service_line ?? "",
        ...(profile?.tags ?? []),
      ].some((value) => value.toLocaleLowerCase().includes(term));
    })
    .sort((a, b) => {
      const aProfile = profilesByCompany.get(a.company_id);
      const bProfile = profilesByCompany.get(b.company_id);
      if (sort === "name_desc") return -nameCompare(a, b);
      if (sort === "review" || sort === "review_desc") {
        const aDate = aProfile?.next_review_date;
        const bDate = bProfile?.next_review_date;
        if (!aDate && bDate) return 1;
        if (aDate && !bDate) return -1;
        if (aDate && bDate && aDate !== bDate) {
          return sort === "review" ? aDate.localeCompare(bDate) : bDate.localeCompare(aDate);
        }
      } else if (sort === "status") {
        const value = collator.compare(
          STATUS_LABELS[aProfile?.status ?? "active"],
          STATUS_LABELS[bProfile?.status ?? "active"],
        );
        if (value) return value;
      } else if (sort === "service") {
        const aService = aProfile?.service_line ?? "";
        const bService = bProfile?.service_line ?? "";
        if (!aService && bService) return 1;
        if (aService && !bService) return -1;
        const value = collator.compare(aService, bService);
        if (value) return value;
      }
      return nameCompare(a, b);
    });
}

/** Only currently visible, named, eligible clients may enter a bulk change (max 50). */
export function selectedVisibleFirmClients(
  filtered: FirmClientRow[],
  selectedCompanyIds: string[],
): FirmClientRow[] {
  const selected = new Set(selectedCompanyIds);
  const distinct = new Set<string>();
  return filtered
    .filter((client) => {
      if (!client.companies || !selected.has(client.company_id) || distinct.has(client.company_id))
        return false;
      distinct.add(client.company_id);
      return true;
    })
    .slice(0, 50);
}

export function firstFiftyFirmClientIds(filtered: FirmClientRow[]): string[] {
  const distinct = new Set<string>();
  for (const client of filtered) {
    if (!client.companies) continue;
    distinct.add(client.company_id);
    if (distinct.size === 50) break;
  }
  return [...distinct];
}

/** Safe spreadsheet exports: quote delimiters and neutralise formula cells. */
export function csvField(value: string): string {
  const safe = /^[\s]*[=+\-@\t\r]/u.test(value) ? "'" + value : value;
  return '"' + safe.replace(/"/g, '""') + '"';
}

export function firmClientCsv(rows: FirmClientRow[], profiles: FirmClientProfile[]): string {
  const profileMap = new Map(profiles.map((profile) => [profile.company_id, profile]));
  const headers = [
    "Client",
    "Status",
    "Access",
    "Contact",
    "Email",
    "Industry",
    "Service",
    "Tags",
    "Review date",
  ];
  const lines = rows.map((client) => {
    const profile = profileMap.get(client.company_id);
    return [
      getFirmClientName(client),
      STATUS_LABELS[profile?.status ?? "active"],
      client.access_level,
      profile?.primary_contact_name ?? "",
      profile?.primary_contact_email ?? "",
      profile?.industry ?? "",
      profile?.service_line ?? "",
      (profile?.tags ?? []).join("; "),
      profile?.next_review_date ?? "",
    ]
      .map(csvField)
      .join(",");
  });
  return "\uFEFF" + [headers.map(csvField).join(","), ...lines].join("\r\n");
}
