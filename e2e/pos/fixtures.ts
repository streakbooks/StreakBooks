// Isolated browser fixture only. No auth/DB/provider verification is implied.
import { useState } from "react";
import { buildPosCatalogueQuote, type PosQuoteInput } from "@/lib/pos/catalogue-quote";
const companyId = "11111111-1111-4111-8111-111111111111";
const productId = "22222222-2222-4222-8222-222222222222";
const products = [
  {
    id: productId,
    company_id: companyId,
    name: "Consultation",
    code: "CONS",
    unit: "hour",
    is_active: true,
    sales_price_minor: 10000,
    sales_tax_rate_bps: 1000,
  },
];
export const useServerFn = <T>(fn: T): T => fn;
export const useCanDo = () => new URLSearchParams(location.search).get("denied") !== "true";
export function useActiveCompany() {
  const [activeId, setActiveId] = useState(companyId);
  (window as unknown as { switchPosCompany: () => void }).switchPosCompany = () =>
    setActiveId(productId);
  return { company: { id: activeId }, isPending: false, isError: false };
}
export async function searchPosCatalogue({ data }: { data: { companyId: string; q?: string } }) {
  return products.filter(
    (p) =>
      p.company_id === data.companyId &&
      (p.name + p.code).toLowerCase().includes((data.q ?? "").toLowerCase()),
  );
}
let quoteFailed = false;
export async function previewPosCatalogueCart({ data }: { data: PosQuoteInput }) {
  if (new URLSearchParams(location.search).get("quoteError") === "true" && !quoteFailed) {
    quoteFailed = true;
    throw new Error("Price service unavailable");
  }
  return buildPosCatalogueQuote(data, products, "USD", "exclusive");
}

import type { PosWorkspace } from "@/lib/pos/register-contracts";
const locationId = "33333333-3333-4333-8333-333333333333";
const accountId = "44444444-4444-4444-8444-444444444444";
const userId = "55555555-5555-4555-8555-555555555555";
const workspace: PosWorkspace = {
  userId,
  currency: "USD",
  registers: [],
  openSessions: [],
  recentSessions: [],
  locations: [{ id: locationId, name: "City Store", code: "CITY" }],
  cashAccounts: [{ id: accountId, name: "Till cash", code: "1000" }],
  members: [{ id: userId, name: "Cashier One", email: "cashier@example.test" }],
  locationAccess: [],
  canManage: true,
  canOpen: true,
  canClose: true,
};
export async function getPosWorkspace() {
  return structuredClone(workspace);
}
export async function createPosRegister({
  data,
}: {
  data: {
    registerId: string;
    code: string;
    name: string;
    locationId: string;
    cashAccountId: string;
  };
}) {
  workspace.registers.push({
    id: data.registerId,
    code: data.code,
    name: data.name,
    location_id: data.locationId,
    cash_account_id: data.cashAccountId,
    is_active: true,
    location_name: "City Store",
  });
  return { id: data.registerId };
}
export async function setPosLocationAccess({
  data,
}: {
  data: { locationId: string; userId: string; allowed: boolean };
}) {
  workspace.locationAccess = workspace.locationAccess.filter(
    (row) => row.location_id !== data.locationId || row.user_id !== data.userId,
  );
  if (data.allowed)
    workspace.locationAccess.push({ location_id: data.locationId, user_id: data.userId });
  return { updated: true };
}
export async function openPosSession({
  data,
}: {
  data: { targetId: string; amountMinor: string; operationId: string };
}) {
  const existing = workspace.openSessions.find((session) => session.register_id === data.targetId);
  if (existing) return { id: existing.id };
  const id = crypto.randomUUID();
  workspace.openSessions.push({
    id,
    register_id: data.targetId,
    opened_by: userId,
    opened_at: new Date().toISOString(),
    opening_float_minor: data.amountMinor,
    currency_code: "USD",
    closed_at: null,
    closing_count_minor: null,
  });
  return { id };
}
export async function closePosSession({
  data,
}: {
  data: { targetId: string; amountMinor: string; operationId: string };
}) {
  const session = workspace.openSessions.find((row) => row.id === data.targetId);
  if (!session) throw new Error("Session unavailable");
  if (session.opening_float_minor !== data.amountMinor)
    throw new Error(
      "Cash variance requires an approved accounting adjustment; session remains open",
    );
  workspace.recentSessions.unshift({
    ...session,
    closed_at: new Date().toISOString(),
    closing_count_minor: data.amountMinor,
  });
  workspace.openSessions = workspace.openSessions.filter((row) => row.id !== data.targetId);
  return { id: data.targetId };
}
