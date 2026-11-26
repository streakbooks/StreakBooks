import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate: (input: unknown) => unknown = (input) => input;
    const chain = {
      middleware() {
        return chain;
      },
      validator(fn: (input: unknown) => unknown) {
        validate = fn;
        return chain;
      },
      handler(fn: (args: { data: unknown; context: unknown }) => Promise<unknown>) {
        return async (args: { data: unknown; context: unknown }) =>
          fn({ ...args, data: validate(args.data) });
      },
    };
    return chain;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/lib/assert-company-access", () => ({ assertCompanyMember: vi.fn() }));
vi.mock("@/lib/documents/email-provider.server", () => ({ readEmailConfig: vi.fn() }));
import { assertCompanyMember } from "@/lib/assert-company-access";
import { readEmailConfig } from "@/lib/documents/email-provider.server";
import { getIntegrationHealth } from "./integration-health.functions";
const companyId = "11111111-1111-4111-8111-111111111111";
const q = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
const from = vi.fn(() => q);
const run = (id = companyId) =>
  (getIntegrationHealth as unknown as (args: unknown) => Promise<unknown>)({
    data: { companyId: id },
    context: { supabase: { from } },
  });
beforeEach(() => {
  vi.resetAllMocks();
  from.mockReturnValue(q);
  q.select.mockReturnValue(q);
  q.eq.mockReturnValue(q);
  q.maybeSingle.mockResolvedValue({ data: { is_demo: false }, error: null });
  vi.mocked(readEmailConfig).mockReturnValue({ configured: false, missing: ["RESEND_API_KEY"] });
});
describe("integration health server boundary", () => {
  it("checks company membership before reading configuration", async () => {
    vi.mocked(assertCompanyMember).mockRejectedValueOnce(new Error("Denied"));
    await expect(run()).rejects.toThrow("Denied");
    expect(from).not.toHaveBeenCalled();
    expect(readEmailConfig).not.toHaveBeenCalled();
  });
  it("returns only safe configuration status for the requested company", async () => {
    vi.mocked(readEmailConfig).mockReturnValue({
      configured: true,
      provider: "resend",
      apiKey: "private-key-must-stay-server-side",
      from: "private-sender@example.test",
    });
    const result = await run();
    expect(q.eq).toHaveBeenCalledWith("id", companyId);
    expect(result).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: "email", status: "configured" })]),
    );
    expect(JSON.stringify(result)).not.toMatch(/private-key|private-sender|apiKey|EMAIL_FROM/);
  });
  it("uses the stored company flag for Demo restrictions", async () => {
    q.maybeSingle.mockResolvedValueOnce({ data: { is_demo: true }, error: null });
    expect(await run()).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: "email", status: "restricted" })]),
    );
  });
  it("does not fabricate readiness when company lookup fails", async () => {
    q.maybeSingle.mockResolvedValueOnce({ data: null, error: { message: "Database unavailable" } });
    await expect(run()).rejects.toThrow("Database unavailable");
    expect(readEmailConfig).not.toHaveBeenCalled();
  });
  it("rejects an inaccessible company", async () => {
    q.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    await expect(run()).rejects.toThrow("not found");
    expect(readEmailConfig).not.toHaveBeenCalled();
  });
  it("rejects malformed company IDs before accessing data", async () => {
    await expect(run("bad")).rejects.toThrow("Invalid");
    expect(from).not.toHaveBeenCalled();
  });
});
