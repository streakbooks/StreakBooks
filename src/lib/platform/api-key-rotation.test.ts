import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { rotateApiKey } from "./api-key-rotation";

describe("API key rotation", () => {
  it("plans a rotation without storing the secret in this process", () => {
    expect(
      rotateApiKey({
        role: "platform_owner",
        keyId: "key-1",
        label: "Office",
        reason: "Quarterly",
      }),
    ).toEqual({
      status: "ready",
      retiredKeyId: "key-1",
      replacementStored: false,
      secretStored: false,
      audit: { action: "api_key.rotate", reason: "Quarterly" },
    });
  });

  it("refuses support staff and a blank label", () => {
    expect(() =>
      rotateApiKey({ role: "platform_support", keyId: null, label: "Office", reason: "Quarterly" }),
    ).toThrow(/permission/);
    expect(() =>
      rotateApiKey({ role: "platform_owner", keyId: null, label: "  ", reason: "Quarterly" }),
    ).toThrow(/Name the replacement/);
  });

  it("stores only a hash and has not been applied", () => {
    const sql = readFileSync(
      new URL("../../../supabase/migrations/20261102200000_platform_api_keys.sql", import.meta.url),
      "utf8",
    );
    expect(sql).toContain("READY-TO-APPLY");
    expect(sql).toContain("key_hash text NOT NULL");
    expect(sql).not.toContain("raw_key");
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.platform_rotate_api_key(uuid, text, text) FROM PUBLIC, anon",
    );
    expect(sql).toContain("jsonb_build_object('key', _new)");
  });
});
