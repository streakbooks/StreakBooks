import { describe, expect, it } from "vitest";
import { resolveMessagingRetentionPurgeMode } from "./retention";

describe("messaging retention purge mode", () => {
  it("defaults to dry-run unless execute is requested and env allows it", () => {
    expect(resolveMessagingRetentionPurgeMode({ execute: true, envExecuteFlag: undefined })).toBe(
      "dry_run",
    );
    expect(resolveMessagingRetentionPurgeMode({ execute: false, envExecuteFlag: "1" })).toBe(
      "dry_run",
    );
    expect(resolveMessagingRetentionPurgeMode({ execute: true, envExecuteFlag: "1" })).toBe(
      "execute",
    );
  });
});
