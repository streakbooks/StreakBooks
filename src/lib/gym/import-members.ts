export type MemberImportRow = {
  displayName: string;
  email: string;
  status: string;
};

export type MemberImportPlan = {
  ready: MemberImportRow[];
  duplicates: MemberImportRow[];
  errors: { row: number; message: string }[];
};

const STATUSES = new Set([
  "prospect",
  "trial",
  "active",
  "inactive",
  "frozen",
  "suspended",
  "expired",
  "cancelled",
]);

export function planMemberImport(
  rows: readonly MemberImportRow[],
  existingEmails: readonly string[],
): MemberImportPlan {
  const seen = new Set(existingEmails.map((email) => email.trim().toLowerCase()).filter(Boolean));
  const ready: MemberImportRow[] = [];
  const duplicates: MemberImportRow[] = [];
  const errors: { row: number; message: string }[] = [];
  rows.forEach((row, index) => {
    const displayName = row.displayName.trim();
    const email = row.email.trim().toLowerCase();
    if (!displayName) {
      errors.push({ row: index + 1, message: "Display name is required" });
      return;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push({ row: index + 1, message: "Email is not usable" });
      return;
    }
    if (!STATUSES.has(row.status)) {
      errors.push({ row: index + 1, message: "Status is not a member status" });
      return;
    }
    if (email && seen.has(email)) {
      duplicates.push({ displayName, email, status: row.status });
      return;
    }
    if (email) seen.add(email);
    ready.push({ displayName, email, status: row.status });
  });
  return { ready, duplicates, errors };
}
