import { describe, expect, it, vi } from "vitest";
import {
  checkAzureInvoiceOcr,
  readOcrConfig,
  signOcrJob,
  submitAzureInvoiceOcr,
  verifyOcrJob,
} from "./ocr-provider.server";

const cfg = {
  configured: true as const,
  endpoint: "https://testing.cognitiveservices.azure.com",
  apiKey: "server-api-key",
  signingKey: "this-is-a-very-long-signing-secret-with-entropy",
};
const companyId = "123e4567-e89b-12d3-a456-426614174000";
const attachmentId = "123e4567-e89b-12d3-a456-426614174001";
const userId = "123e4567-e89b-12d3-a456-426614174002";
const resultId = "123e4567-e89b-12d3-a456-426614174003";

describe("Files OCR secure provider", () => {
  it("requires valid restricted Azure endpoint and server secrets", () => {
    expect(readOcrConfig({}).configured).toBe(false);
    expect(readOcrConfig({
      AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT: "http://example.com",
      AZURE_DOCUMENT_INTELLIGENCE_KEY: "secret",
      DOCUMENT_OCR_JOB_SIGNING_KEY: cfg.signingKey,
    }).configured).toBe(false);
    expect(readOcrConfig({
      AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT: "https://x.cognitiveservices.azure.com",
      AZURE_DOCUMENT_INTELLIGENCE_KEY: cfg.apiKey,
      DOCUMENT_OCR_JOB_SIGNING_KEY: cfg.signingKey,
    })).toEqual(cfgEndpoint("https://x.cognitiveservices.azure.com"));
  });

  it("submits base64Source and returns only a validated result UUID", async () => {
    const mock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toContain("prebuilt-invoice:analyze");
      expect(url).toContain("pages=1-3");
      expect((init?.headers as Record<string, string>)["Ocp-Apim-Subscription-Key"]).toBe(cfg.apiKey);
      expect(JSON.parse(String(init?.body)).base64Source).toBe("AQID");
      return new Response(null, {
        status: 202,
        headers: {
          "operation-location":
            `${cfg.endpoint}/documentintelligence/documentModels/prebuilt-invoice/analyzeResults/${resultId}?api-version=2024-11-30`,
        },
      });
    });
    expect(await submitAzureInvoiceOcr(cfg, new Uint8Array([1, 2, 3]), mock as typeof fetch))
      .toBe(resultId);
  });

  it("rejects OCR provider redirect or operation URL pointing to another host", async () => {
    const evil = async () => new Response(null, {
      status: 202,
      headers: {
        "operation-location":
          `https://attacker.example/documentintelligence/documentModels/prebuilt-invoice/analyzeResults/${resultId}?api-version=2024-11-30`,
      },
    });
    await expect(submitAzureInvoiceOcr(cfg, new Uint8Array([1]), evil as typeof fetch))
      .rejects.toThrow("Unexpected OCR result location");
  });

  it("cryptographically binds result token to user, company, file and expiry", () => {
    const claims = {
      userId, companyId, attachmentId, resultId, issuedAt: 1_800_000_000_000,
    };
    const token = signOcrJob(cfg, claims);
    expect(verifyOcrJob(cfg, token, { companyId, userId, attachmentId }, claims.issuedAt + 1000))
      .toEqual(claims);
    expect(() =>
      verifyOcrJob(cfg, token, {
        companyId, attachmentId, userId: "123e4567-e89b-12d3-a456-426614174005",
      }, claims.issuedAt + 1000),
    ).toThrow("Invalid or expired");
    expect(() => verifyOcrJob(
      cfg, token, { companyId, attachmentId, userId }, claims.issuedAt + 46 * 60 * 1000,
    )).toThrow("Invalid or expired");
    const tampered = token.slice(0, -1) + (token.endsWith("A") ? "B" : "A");
    expect(() => verifyOcrJob(cfg, tampered, {
      companyId, attachmentId, userId,
    }, claims.issuedAt + 1000)).toThrow("Invalid or expired");
  });

  it("polls running and completed results without returning OCR raw text", async () => {
    const mock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.method).toBe("GET");
      return Response.json({
        status: "succeeded",
        analyzeResult: {
          content: "PRIVATE RAW DOCUMENT TEXT SHOULD NOT LEAVE SERVER",
          documents: [{
            fields: {
              VendorName: { valueString: "Vendor" },
              InvoiceTotal: { valueCurrency: { amount: 10, currencyCode: "USD" } },
            },
          }],
        },
      });
    });
    const result = await checkAzureInvoiceOcr(cfg, resultId, mock as typeof fetch);
    expect(result).toMatchObject({
      status: "completed", suggestions: { supplierName: "Vendor", totalMinor: 1000 },
    });
    expect(JSON.stringify(result)).not.toContain("PRIVATE RAW DOCUMENT TEXT");
    const waiting = async () => Response.json({ status: "running" });
    expect(await checkAzureInvoiceOcr(cfg, resultId, waiting as typeof fetch))
      .toEqual({ status: "pending" });
  });

  it("rejects large or corrupt provider responses", async () => {
    const large = async () => new Response("{}", {
      headers: { "content-length": "4000001" },
    });
    await expect(checkAzureInvoiceOcr(cfg, resultId, large as typeof fetch))
      .rejects.toThrow("exceeded");
    const corrupt = async () => new Response("not-json");
    await expect(checkAzureInvoiceOcr(cfg, resultId, corrupt as typeof fetch))
      .rejects.toThrow("invalid JSON");
  });
});

function cfgEndpoint(endpoint: string) {
  return { ...cfg, endpoint };
}
