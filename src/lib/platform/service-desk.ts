import { platformRoleAllows, type PlatformRoleName } from "./platform-roles";

export function openServiceCase(input: {
  role: PlatformRoleName;
  companyId: string;
  subject: string;
  reason: string;
}): {
  status: "open";
  ledgerAttached: false;
  subject: string;
  audit: { action: "service_case.open"; reason: string };
} {
  if (!platformRoleAllows(input.role, "support.manage"))
    throw new Error("Platform permission required");
  const subject = input.subject.trim();
  const reason = input.reason.trim();
  if (input.companyId.trim().length === 0) throw new Error("Choose a business");
  if (subject.length < 3) throw new Error("Name the case");
  if (reason.length < 3) throw new Error("A reason is required");
  return {
    status: "open",
    ledgerAttached: false,
    subject,
    audit: { action: "service_case.open", reason },
  };
}
