import { describe, expect, it, vi } from "vitest";
import {
  downloadReceivedFile,
  inboxAddress,
  isForCompanyInbox,
  isTrustedReceivedFileUrl,
  listReceivedEmails,
  normaliseRecipient,
  readReceiveConfig,
} from "./email-inbox-provider.server";

const cfg = {
  configured: true as const,
  provider: "resend" as const,
  apiKey: "server-secret",
  domain: "rx.example.resend.app",
};

describe("Files incoming email provider", () => {
  it("fails closed until the receiving domain and server key are configured", () => {
    expect(readReceiveConfig({}).configured).toBe(false);
    expect(readReceiveConfig({ RESEND_INBOUND_API_KEY: "k" })).toEqual({
      configured: false,
      missing: ["RESEND_RECEIVING_DOMAIN"],
    });
    expect(
      readReceiveConfig({
        RESEND_INBOUND_API_KEY: "secret",
        RESEND_RECEIVING_DOMAIN: "RX.EXAMPLE.RESEND.APP",
      }),
    ).toEqual({
      configured: true,
      provider: "resend",
      apiKey: "secret",
      domain: "rx.example.resend.app",
    });
  });

  it("derives a stable company alias and rejects forged local token", () => {
    const token = "docs-" + "a".repeat(32);
    expect(inboxAddress(token, cfg.domain)).toBe(`${token}@rx.example.resend.app`);
    expect(() => inboxAddress("docs-admin", cfg.domain)).toThrow("Invalid company inbox token");
  });

  it("accepts only recipient-equal messages even with display names", () => {
    const recipient = inboxAddress("docs-" + "a".repeat(32), cfg.domain);
    expect(normaliseRecipient("Test <ABC@example.com>")).toBe("abc@example.com");
    expect(isForCompanyInbox({ to: [`Support <${recipient}>`] }, recipient)).toBe(true);
    expect(isForCompanyInbox({ to: ["other@example.org"] }, recipient)).toBe(false);
    expect(isForCompanyInbox({ to: [recipient + ".attacker.test"] }, recipient)).toBe(false);
  });

  it("never puts the receiving key into the URL or response data", async () => {
    const fake = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe("https://api.resend.com/emails/receiving?limit=50");
      expect((init.headers as Record<string, string>)["Authorization"]).toBe(
        "Bearer server-secret",
      );
      return new Response(
        JSON.stringify({
          data: [
            {
              id: "e1",
              to: ["m@example.com"],
              from: "sender@example.com",
              subject: "hello",
              created_at: "2026-11-06",
            },
          ],
          has_more: true,
        }),
        { status: 200 },
      );
    });
    const result = await listReceivedEmails(cfg, undefined, fake as typeof fetch);
    expect(result.has_more).toBe(true);
    expect(result.data[0]?.subject).toBe("hello");
    expect(JSON.stringify(result)).not.toContain("server-secret");
  });

  it("rejects untrusted links and never allows HTTP, userinfo or redirects", async () => {
    for (const url of [
      "http://cdn.resend.com/doc",
      "https://localhost/test",
      "https://resend.com@localhost/private",
      "https://resend.com.attacker.test/private",
      "https://169.254.169.254/latest/meta-data",
    ])
      expect(isTrustedReceivedFileUrl(url)).toBe(false);
    expect(isTrustedReceivedFileUrl("https://assets.resend.com/signed/file")).toBe(true);
    const redirect = vi.fn(
      async () => new Response("", { status: 302, headers: { Location: "https://localhost" } }),
    );
    await expect(
      downloadReceivedFile("https://assets.resend.com/file", 1024, redirect as typeof fetch),
    ).rejects.toThrow("Email attachment download failed");
    expect((redirect.mock.calls[0] as unknown as [string, RequestInit])[1].redirect).toBe("error");
  });

  it("bounds streaming downloads even when Content-Length is absent", async () => {
    const mock = async () => new Response(new Uint8Array([1, 2, 3, 4]));
    expect(
      Array.from(await downloadReceivedFile("https://files.resend.com/a", 4, mock as typeof fetch)),
    ).toEqual([1, 2, 3, 4]);
    await expect(
      downloadReceivedFile("https://files.resend.com/a", 3, mock as typeof fetch),
    ).rejects.toThrow("too large");
  });
});
