import { call as originalCall, defaults } from "../voice/server-fixture";
export { defaults };
export async function call(name: string, args: unknown[]) {
  const data = (args[0] as { data?: Record<string, unknown> } | undefined)?.data ?? {};
  if (["listBankAccounts", "getPurchaseOrder", "getBill"].includes(name)) {
    window.voiceServer.calls.push({ name, data });
    if (name === "listBankAccounts")
      return [
        {
          id: "bank-a",
          company_id: "company-a",
          name: "Operating account",
          currency_code: "GBP",
          is_active: true,
          account_code: "1200",
        },
        {
          id: "bank-b",
          company_id: "company-a",
          name: "Savings account",
          currency_code: "GBP",
          is_active: true,
          account_code: "1210",
        },
      ];
    if (name === "getPurchaseOrder")
      return {
        id: data.orderId,
        version: 1,
        contact_id: "00000000-0000-4000-8000-000000000001",
        order_number: "PO-FIX",
        order_date: "2026-11-05",
        currency_code: "GBP",
        status: "draft",
        approval_state: "draft",
        subtotal_minor: 1000,
        tax_minor: 0,
        total_minor: 1000,
        memo: "Existing draft",
        billed_bill_id: null,
        contacts: { name: "ABC Limited" },
        purchase_order_lines: [
          {
            id: "line-a",
            line_no: 1,
            description: "Existing order line",
            account_id: "00000000-0000-4000-8000-000000000012",
            quantity: 1,
            unit_price_minor: 1000,
            net_minor: 1000,
            tax_rate_bps: 0,
            tax_minor: 0,
          },
        ],
      };
    return {
      id: data.billId,
      contact_id: "00000000-0000-4000-8000-000000000001",
      bill_number: "BILL-FIX",
      currency_code: "GBP",
      fx_rate_to_base: 1,
      total_minor: 1000,
      amount_paid_minor: 0,
      amount_credited_minor: 0,
      purchase_bill_lines: [],
    };
  }
  if (
    /^(save|create|authorise|post|void|delete|approve|record|update|send|reset|import|remove|ensure)/i.test(
      name,
    )
  ) {
    window.voiceServer.calls.push({ name, data });
    throw new Error("Create-panel fixture prevents financial writes");
  }
  return originalCall(name, args);
}
