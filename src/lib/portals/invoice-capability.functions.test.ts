import { beforeEach, describe, expect, it, vi } from "vitest";
const middleware = vi.hoisted(() => ({ auth: {} }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate = (input: unknown): unknown => input;
    const chain = {
      middleware(steps: unknown[]) {
        expect(steps).toContain(middleware.auth);
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
vi.mock("@tanstack/react-start/server", () => ({ getRequest: vi.fn() }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({
  requireSupabaseAuth: middleware.auth,
}));
vi.mock("@/lib/portals/portal-payments.server", () => ({ checkoutModeFor: vi.fn() }));
import { checkoutModeFor } from "./portal-payments.server";
import { getPortalInvoice, savePortalSettings } from "./portals.functions";
const membershipId = "11111111-1111-4111-8111-111111111111";
const invoiceId = "22222222-2222-4222-8222-222222222222";
const rpc = vi.fn();
const run = (id = invoiceId) =>
  (getPortalInvoice as unknown as (args: unknown) => Promise<Record<string, unknown>>)({
    data: { membershipId, invoiceId: id },
    context: { supabase: { rpc } },
  });
beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockResolvedValue({
    data: {
      invoice: { id: invoiceId },
      allow_sandbox: false,
      settlement_ready: true,
      payable_minor: 1200,
    },
    error: null,
  });
  vi.mocked(checkoutModeFor).mockReturnValue({ mode: "instructions", livemode: false });
});
describe("invoice payment capability", () => {
  it("retains the authorized invoice payload and reports unavailable checkout before payment entry", async () => {
    expect(await run()).toMatchObject({
      invoice: { id: invoiceId },
      payable_minor: 1200,
      checkout_mode: "instructions",
      checkout_live: false,
    });
    expect(rpc).toHaveBeenCalledWith("portal_get_invoice", {
      payload: { membership_id: membershipId, invoice_id: invoiceId },
    });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("reports sandbox and test-provider capabilities without creating a payment intent", async () => {
    rpc.mockResolvedValueOnce({ data: { allow_sandbox: true }, error: null });
    vi.mocked(checkoutModeFor).mockReturnValueOnce({ mode: "sandbox", livemode: false });
    expect(await run()).toMatchObject({ checkout_mode: "sandbox", checkout_live: false });
    expect(checkoutModeFor).toHaveBeenCalledWith(true);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("does not resolve provider capability for an inaccessible invoice", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "Not authorized" } });
    await expect(run()).rejects.toThrow("Not authorized");
    expect(checkoutModeFor).not.toHaveBeenCalled();
  });
  it("rejects malformed record identifiers before any database access", async () => {
    await expect(run("invalid")).rejects.toThrow("Invalid");
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("portal invitation settings", () => {
  const save = (inviteDays?: number) =>
    (savePortalSettings as unknown as (args: unknown) => Promise<unknown>)({
      data: { companyId: membershipId, inviteDays },
      context: { supabase: { rpc } },
    });
  it.each([0, 91, 2.5])("rejects invalid invitation lifetime %s before saving", async (days) => {
    await expect(save(days)).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each([
    [undefined, 14],
    [1, 1],
    [90, 90],
  ])("persists the requested or default lifetime", async (input, expected) => {
    await save(input);
    expect(rpc).toHaveBeenCalledWith("save_portal_settings", {
      payload: expect.objectContaining({ invite_days: expected }),
    });
  });
});
