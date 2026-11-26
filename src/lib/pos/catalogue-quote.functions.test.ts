import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate = (input: unknown): unknown => input;
    const chain = {
      middleware() {
        return chain;
      },
      validator(fn: typeof validate) {
        validate = fn;
        return chain;
      },
      handler(fn: (args: { data: unknown; context: unknown }) => Promise<unknown>) {
        return (args: { data: unknown; context: unknown }) =>
          fn({ ...args, data: validate(args.data) });
      },
    };
    return chain;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/lib/assert-company-access", () => ({ assertCompanyPermission: vi.fn() }));
vi.mock("@/lib/sales/sales-common", () => ({
  loadTaxTreatment: vi.fn().mockResolvedValue("exclusive"),
}));
import { assertCompanyPermission } from "@/lib/assert-company-access";
import { previewPosCatalogueCart, searchPosCatalogue } from "./catalogue-quote.functions";
const companyId = "11111111-1111-4111-8111-111111111111";
const productId = "22222222-2222-4222-8222-222222222222";
let tables: Record<string, unknown>;
let errors: Record<string, { message: string }>;
const filters = vi.fn();
const selects = vi.fn();
const from = vi.fn((table: string) => {
  const query = {
    select(columns: string) {
      selects(table, columns);
      return query;
    },
    eq(field: string, value: unknown) {
      filters(table, field, value);
      return query;
    },
    or(value: string) {
      filters(table, "or", value);
      return query;
    },
    order(field: string) {
      filters(table, "order", field);
      return query;
    },
    in(field: string, values: unknown) {
      filters(table, field, values);
      return query;
    },
    limit(value: number) {
      filters(table, "limit", value);
      return Promise.resolve({ data: tables[table], error: errors[table] ?? null });
    },
    maybeSingle() {
      return Promise.resolve({ data: tables[table], error: errors[table] ?? null });
    },
  };
  return query;
});
const run = (input: unknown = { companyId, lines: [{ productId, quantity: 1 }] }) =>
  (previewPosCatalogueCart as unknown as (args: unknown) => Promise<unknown>)({
    data: input,
    context: { supabase: { from } },
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(assertCompanyPermission).mockResolvedValue(undefined);
  errors = {};
  tables = {
    companies: { base_currency: "USD" },
    products: [
      {
        id: productId,
        company_id: companyId,
        name: "Service",
        code: "S",
        unit: "each",
        is_active: true,
        sales_price_minor: 10000,
        sales_tax_rate_bps: 1000,
      },
    ],
  };
});
describe("POS quote server boundary (mocked database)", () => {
  it("checks POS view permission and tenant-scopes all catalogue reads", async () => {
    await expect(run()).resolves.toMatchObject({ grossMinor: "11000" });
    expect(assertCompanyPermission).toHaveBeenCalledWith(expect.anything(), companyId, "pos.view");
    expect(filters).toHaveBeenCalledWith("companies", "id", companyId);
    expect(filters).toHaveBeenCalledWith("products", "company_id", companyId);
    expect(filters).toHaveBeenCalledWith("products", "id", [productId]);
  });
  it("reads only checkout-safe product fields", async () => {
    await run();
    const columns = selects.mock.calls.find(([table]) => table === "products")?.[1];
    expect(columns).not.toMatch(/purchase_cost|expense_account/);
  });
  it("performs no reads when permission is denied", async () => {
    vi.mocked(assertCompanyPermission).mockRejectedValueOnce(new Error("Denied"));
    await expect(run()).rejects.toThrow("Denied");
    expect(from).not.toHaveBeenCalled();
  });
  it("ignores caller-supplied money and tax", async () => {
    await expect(
      run({
        companyId,
        currency: "JPY",
        lines: [{ productId, quantity: 1, unitPriceMinor: 1, taxRateBps: 0 }],
      }),
    ).resolves.toMatchObject({ currency: "USD", grossMinor: "11000" });
  });
  it.each(["companies", "products"])("propagates %s query failures", async (table) => {
    errors[table] = { message: "Database unavailable" };
    await expect(run()).rejects.toThrow("Database unavailable");
  });
  it("does not silently default a missing company currency", async () => {
    tables["companies"] = null;
    await expect(run()).rejects.toThrow(/currency/);
  });
  it("rejects a removed product rather than silently omitting its line", async () => {
    tables["products"] = [];
    await expect(run()).rejects.toThrow(/unavailable/);
  });
  it("rejects malformed requests before any database access", () => {
    expect(() => run({ companyId: "bad", lines: [] })).toThrow();
    expect(from).not.toHaveBeenCalled();
  });
});

const search = (data: unknown = { companyId, q: "CONS" }) =>
  (searchPosCatalogue as unknown as (args: unknown) => Promise<unknown>)({
    data,
    context: { supabase: { from } },
  });
describe("POS catalogue lookup", () => {
  it("limits active company rows, stable order and escaped name/SKU search", async () => {
    await search({ companyId, q: "%,(x)" });
    expect(filters).toHaveBeenCalledWith("products", "company_id", companyId);
    expect(filters).toHaveBeenCalledWith("products", "is_active", true);
    expect(filters).toHaveBeenCalledWith("products", "limit", 50);
    expect(filters).toHaveBeenCalledWith("products", "order", "name");
    expect(filters).toHaveBeenCalledWith("products", "order", "id");
    expect(filters.mock.calls.find((call) => call[1] === "or")?.[2]).toContain("name.ilike.");
  });
  it("requires permission before lookup", async () => {
    vi.mocked(assertCompanyPermission).mockRejectedValueOnce(new Error("Denied"));
    await expect(search()).rejects.toThrow("Denied");
    expect(from).not.toHaveBeenCalled();
  });
  it("propagates lookup errors", async () => {
    errors["products"] = { message: "Lookup failed" };
    await expect(search()).rejects.toThrow("Lookup failed");
  });
});
