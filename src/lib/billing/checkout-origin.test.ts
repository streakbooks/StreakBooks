import { afterEach, describe, expect, it } from "vitest";
import { allowedCheckoutOrigins, assertCheckoutOrigin } from "@/lib/billing/checkout-origin";

const ENV_KEYS = [
  "APP_ORIGIN",
  "SITE_URL",
  "VITE_SITE_URL",
  "BILLING_ALLOWED_ORIGINS",
  "VERCEL_URL",
  "VERCEL_BRANCH_URL",
  "VERCEL_PROJECT_PRODUCTION_URL",
] as const;

const saved: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
    delete saved[key];
  }
});

function setEnv(key: (typeof ENV_KEYS)[number], value: string | undefined) {
  saved[key] = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

describe("assertCheckoutOrigin", () => {
  it("allows localhost without configuration", () => {
    expect(assertCheckoutOrigin("http://localhost:8080")).toBe("http://localhost:8080");
  });

  it("allows APP_ORIGIN", () => {
    setEnv("APP_ORIGIN", "https://streak-books.vercel.app");
    expect(assertCheckoutOrigin("https://streak-books.vercel.app/settings")).toBe(
      "https://streak-books.vercel.app",
    );
  });

  it("allows the request host that served checkout", () => {
    expect(
      assertCheckoutOrigin("https://streak-books.vercel.app", {
        host: "streak-books.vercel.app",
        proto: "https",
      }),
    ).toBe("https://streak-books.vercel.app");
  });

  it("rejects a foreign return host", () => {
    setEnv("APP_ORIGIN", "https://streakbooks.vercel.app");
    expect(() => assertCheckoutOrigin("https://evil.example")).toThrow(/not allowed/i);
  });

  it("accepts comma-separated allowed origins", () => {
    setEnv(
      "BILLING_ALLOWED_ORIGINS",
      "https://streak-books.vercel.app, https://streakbooks.vercel.app",
    );
    expect(allowedCheckoutOrigins().has("https://streak-books.vercel.app")).toBe(true);
    expect(allowedCheckoutOrigins().has("https://streakbooks.vercel.app")).toBe(true);
  });
});
