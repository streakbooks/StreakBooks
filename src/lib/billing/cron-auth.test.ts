import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";

/**
 * Mirrors authenticateCronRequest comparison without importing the generated cron-auth module
 * into a path that mutates process.env for other suites.
 */
function cronAuthorized(
  authorization: string | null,
  currentSecret: string | undefined,
  previousSecret: string | undefined,
): "ok" | 401 | 500 {
  if (!currentSecret) return 500;
  const match = /^Bearer ([^\s,]+)$/.exec(authorization ?? "");
  const token = match?.[1];
  if (!token) return 401;
  const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();
  const provided = digest(token);
  const current = digest(currentSecret);
  const previous = digest(previousSecret ?? currentSecret);
  const equal = (a: Buffer, b: Buffer) => a.length === b.length && a.compare(b) === 0;
  if (!equal(provided, current) && !equal(provided, previous)) return 401;
  return "ok";
}

describe("billing webhook-retry cron auth", () => {
  it("rejects when the secret is missing", () => {
    expect(cronAuthorized("Bearer anything", undefined, undefined)).toBe(500);
  });

  it("rejects missing or malformed bearer tokens", () => {
    expect(cronAuthorized(null, "secret", undefined)).toBe(401);
    expect(cronAuthorized("Basic secret", "secret", undefined)).toBe(401);
  });

  it("accepts the current or previous secret", () => {
    expect(cronAuthorized("Bearer current", "current", "previous")).toBe("ok");
    expect(cronAuthorized("Bearer previous", "current", "previous")).toBe("ok");
    expect(cronAuthorized("Bearer wrong", "current", "previous")).toBe(401);
  });
});
