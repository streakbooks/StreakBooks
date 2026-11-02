import { z } from "zod";
export const supportRequestSchema = z.object({
  companyId: z.string().uuid(),
  reason: z.string().trim().min(3).max(1000),
  minutes: z.number().int().min(15).max(240),
  requestId: z.string().uuid(),
});
export const supportRevokeSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().trim().min(3).max(1000),
});
export type SupportRequest = {
  id: string;
  company_id: string;
  business: string;
  requester_id: string;
  requester: string | null;
  status: "pending" | "active" | "rejected" | "expired" | "revoked";
  reason: string;
  expires_at: string;
  created_at: string;
  approval_id: string | null;
  approver_id: string | null;
};
export type SupportState = { ready: false; rows: [] } | { ready: true; rows: SupportRequest[] };
export function isMissingSupportSchema(error: { code?: string } | null): boolean {
  return error?.code === "PGRST202" || error?.code === "42883";
}
export function platformDate(value: unknown): string {
  if (typeof value !== "string" || !value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Invalid recorded date"
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}
