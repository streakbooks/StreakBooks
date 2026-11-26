import { describe, expect, it, vi } from "vitest";
import { configuredSender, loadCommunicationConfig } from "./communication-settings.server";

function configClient(document: unknown) {
  const maybeSingle = vi
    .fn()
    .mockResolvedValue({ data: document == null ? null : { document }, error: null });
  const category = vi.fn(() => ({ maybeSingle }));
  const company = vi.fn(() => ({ eq: category }));
  const select = vi.fn(() => ({ eq: company }));
  const from = vi.fn(() => ({ select }));
  return { client: { from } as never, from, select, company, category, maybeSingle };
}

describe("organisation communication settings", () => {
  it("loads the saved organisation document and applies schema defaults", async () => {
    const { client, from, maybeSingle } = configClient(null);

    await expect(loadCommunicationConfig(client, "company-id")).resolves.toMatchObject({
      email_from_name: "",
      reply_to: "",
      quiet_hours_enabled: false,
      quiet_hours_start: "22:00",
      quiet_hours_end: "07:00",
    });
    expect(from).toHaveBeenCalledWith("organisation_config");
    expect(maybeSingle).toHaveBeenCalledOnce();
  });

  it("uses the configured sender name and reply address without replacing the verified sender", () => {
    const sender = configuredSender("verified@example.com", {
      email_from_name: "Accounts",
      reply_to: "replies@example.com",
      quiet_hours_enabled: false,
      quiet_hours_start: "22:00",
      quiet_hours_end: "07:00",
    });

    expect(sender).toEqual({
      from: "Accounts <verified@example.com>",
      replyTo: "replies@example.com",
    });
  });

  it("rejects invalid saved notification documents instead of sending with malformed settings", async () => {
    const { client } = configClient({ email_from_name: "Bad\nSender" });

    await expect(loadCommunicationConfig(client, "company-id")).rejects.toThrow(
      /Saved notification settings are invalid/,
    );
  });
});
