import { describe, expect, it, vi } from "vitest";
import { loadCompanyDocContext } from "@/lib/documents/documents-loader";

const companyId = "10000000-0000-4000-8000-000000000001";

function database(
  brandingInstructions: string | null,
  salesInstructions: string,
  locale = "en-GB",
  dateFormat = "DD/MM/YYYY",
) {
  return {
    from: (table: string) => {
      let selected = "";
      const query = {
        select: (columns: string) => {
          selected = columns;
          return query;
        },
        eq: () => query,
        maybeSingle: async () => ({
          error: null,
          data:
            table === "companies"
              ? {
                  name: "Example Co",
                  legal_name: "Example Company Limited",
                  timezone: "UTC",
                  locale,
                  date_format: dateFormat,
                }
              : table === "company_branding"
                ? { payment_instructions: brandingInstructions }
                : table === "company_workflow_settings" && selected === "sales_payment_instructions"
                  ? { sales_payment_instructions: salesInstructions }
                  : null,
        }),
      };
      return query;
    },
    rpc: vi.fn(async () => ({
      error: null,
      data: {
        company: {},
        branding: { payment_instructions: brandingInstructions },
        party: null,
        provenance: "draft",
      },
    })),
  };
}

describe("loadCompanyDocContext Sales payment instructions", () => {
  it("loads the workflow default for Sales documents", async () => {
    const ctx = await loadCompanyDocContext(
      database(null, "Pay within 14 days") as never,
      companyId,
      { kind: "sales_invoice", id: "20000000-0000-4000-8000-000000000002" },
    );
    expect(ctx.branding.paymentInstructions).toBe("Pay within 14 days");
  });

  it("keeps explicit document branding ahead of the workflow default", async () => {
    const ctx = await loadCompanyDocContext(
      database("Pay using this document reference", "Pay within 14 days") as never,
      companyId,
      { kind: "sales_invoice", id: "20000000-0000-4000-8000-000000000002" },
    );
    expect(ctx.branding.paymentInstructions).toBe("Pay using this document reference");
  });

  it("passes saved organisation locale and date format into document generation", async () => {
    const ctx = await loadCompanyDocContext(
      database(null, "", "en-US", "MM/DD/YYYY") as never,
      companyId,
      { kind: "sales_invoice", id: "20000000-0000-4000-8000-000000000002" },
    );
    expect(ctx.locale).toBe("en-US");
    expect(ctx.dateFormat).toBe("MM/DD/YYYY");
  });

  it("uses a distinct saved legal name in customer-facing document branding", async () => {
    const ctx = await loadCompanyDocContext(database(null, "") as never, companyId);

    expect(ctx.branding.displayName).toBe("Example Co");
    expect(ctx.branding.legalName).toBe("Example Company Limited");
  });
});
