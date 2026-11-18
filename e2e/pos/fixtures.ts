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
import type { PosCashSaleResult } from "@/lib/pos/cash-sale";
const locationId = "33333333-3333-4333-8333-333333333333";
const accountId = "44444444-4444-4444-8444-444444444444";
const userId = "55555555-5555-4555-8555-555555555555";
const registerId = "66666666-6666-4666-8666-666666666666";
const sessionId = "77777777-7777-4777-8777-777777777777";
const workspace: PosWorkspace = {
  userId,
  currency: "USD",
  registers: [
    {
      id: registerId,
      code: "FRONT",
      name: "Front Counter",
      location_id: locationId,
      cash_account_id: accountId,
      is_active: true,
      location_name: "City Store",
    },
  ],
  openSessions: [
    {
      id: sessionId,
      register_id: registerId,
      opened_by: userId,
      opened_at: new Date().toISOString(),
      opening_float_minor: "10000",
      expected_cash_minor: "10000",
      currency_code: "USD",
      closed_at: null,
      closing_count_minor: null,
    },
  ],
  recentSessions: [],
  locations: [{ id: locationId, name: "City Store", code: "CITY" }],
  cashAccounts: [{ id: accountId, name: "Till cash", code: "1000" }],
  members: [{ id: userId, name: "Cashier One", email: "cashier@example.test" }],
  locationAccess: [],
  canManage: true,
  canOpen: true,
  canClose: true,
  canSell: true,
  canAdjustCash: true,
  canRefund: true,
};
const recentSales: { id: string; total_minor: string; status: string; created_at: string }[] = [];
export async function getPosWorkspace() {
  const result = structuredClone(workspace);
  if (new URLSearchParams(location.search).get("multipleSessions") === "true") {
    const secondRegister = { ...result.registers[0]!, id: "second-register", name: "Back Counter" };
    result.registers.push(secondRegister);
    result.openSessions.push({
      ...result.openSessions[0]!,
      id: "second-session",
      register_id: secondRegister.id,
    });
  }
  return result;
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
    expected_cash_minor: data.amountMinor,
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
  if (session.expected_cash_minor !== data.amountMinor)
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
export async function completePosCashSale({
  data,
}: {
  data: {
    sessionId: string;
    operationId: string;
    cashTenderedMinor: string;
    lines: { productId: string; quantity: number }[];
  };
}): Promise<PosCashSaleResult> {
  const session = workspace.openSessions.find((row) => row.id === data.sessionId);
  if (!session) throw new Error("Session unavailable");
  const quote = buildPosCatalogueQuote(
    { companyId, lines: data.lines },
    products,
    "USD",
    "exclusive",
  );
  const gross = quote.grossMinor;
  if (BigInt(data.cashTenderedMinor) < BigInt(gross))
    throw new Error("Cash tendered is below sale total");
  const change = (BigInt(data.cashTenderedMinor) - BigInt(gross)).toString();
  session.expected_cash_minor = (BigInt(session.expected_cash_minor) + BigInt(gross)).toString();
  const saleId = crypto.randomUUID();
  recentSales.unshift({
    id: saleId,
    total_minor: gross,
    status: "completed",
    created_at: new Date().toISOString(),
  });
  return {
    saleId,
    journalId: crypto.randomUUID(),
    receiptCode: data.operationId,
    netMinor: quote.netMinor,
    taxMinor: quote.taxMinor,
    grossMinor: gross,
    cashTenderedMinor: data.cashTenderedMinor,
    changeMinor: change,
    expectedCashMinor: session.expected_cash_minor,
  };
}
export async function recordPosCashMovement({
  data,
}: {
  data: {
    sessionId: string;
    amountMinor: string;
    kind: "cash_in" | "cash_out";
  };
}) {
  const session = workspace.openSessions.find((row) => row.id === data.sessionId);
  if (!session) throw new Error("Session unavailable");
  const delta = BigInt(data.amountMinor);
  const next =
    data.kind === "cash_in"
      ? BigInt(session.expected_cash_minor) + delta
      : BigInt(session.expected_cash_minor) - delta;
  if (next < 0n) throw new Error("Cash out exceeds expected drawer balance");
  session.expected_cash_minor = next.toString();
  return { movementId: crypto.randomUUID(), expectedCashMinor: session.expected_cash_minor };
}
export async function getPosRecentSales() {
  return recentSales.map((sale) => ({
    id: sale.id,
    totalMinor: sale.total_minor,
    status: sale.status,
    createdAt: sale.created_at,
  }));
}
export async function refundPosCashSale({
  data,
}: {
  data: { companyId: string; saleId: string; operationId: string };
}) {
  const sale = recentSales.find((row) => row.id === data.saleId);
  if (!sale || sale.status !== "completed") throw new Error("Sale unavailable for refund");
  const session = workspace.openSessions[0];
  if (!session) throw new Error("Session unavailable");
  sale.status = "refunded";
  session.expected_cash_minor = (
    BigInt(session.expected_cash_minor) - BigInt(sale.total_minor)
  ).toString();
  return {
    refundId: crypto.randomUUID(),
    saleId: data.saleId,
    amountMinor: sale.total_minor,
    expectedCashMinor: session.expected_cash_minor,
    journalId: crypto.randomUUID(),
  };
}
