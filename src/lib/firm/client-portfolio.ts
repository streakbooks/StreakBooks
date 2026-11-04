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

export function getFirmClientName(row: FirmClientRow): string {
  return row.companies?.name ?? "Restricted client";
}

export function filterFirmClients(
  clients: FirmClientRow[],
  profiles: FirmClientProfile[],
  query: string,
  status: FirmClientStatus | "all",
): FirmClientRow[] {
  const profilesByCompany = new Map(profiles.map((profile) => [profile.company_id, profile]));
  const term = query.trim().toLocaleLowerCase();
  return clients
    .filter((client) => {
      const profile = profilesByCompany.get(client.company_id);
      const currentStatus = profile?.status ?? "active";
      if (status !== "all" && status !== currentStatus) return false;
      if (!term) return true;
      return [
        client.companies?.name ?? "",
        profile?.primary_contact_name ?? "",
        profile?.primary_contact_email ?? "",
        profile?.industry ?? "",
        profile?.service_line ?? "",
        ...(profile?.tags ?? []),
      ].some((value) => value.toLocaleLowerCase().includes(term));
    })
    .sort((a, b) =>
      getFirmClientName(a).localeCompare(getFirmClientName(b), undefined, {
        sensitivity: "base",
      }),
    );
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
