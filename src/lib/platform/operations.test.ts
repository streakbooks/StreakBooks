import { describe, it, expect } from "vitest";
import { opsApplySchema, parseOpsSearch, localDateInput, localDateToUtc } from "./operations";
const id = "80000000-0000-4000-8000-000000000001";
describe("platform operations boundary", () => {
  it("clears malformed IDs because router merges raw search", () => {
    expect(parseOpsSearch({ module: "bad", item: "invalid", company: "invalid" })).toEqual({
      module: "cases",
      item: undefined,
      company: undefined,
    });
  });
  it("rejects injected fields, stale-version omission and duplicate bulk IDs", () => {
    const envelope = { reason: "Reviewed change", requestId: id };
    expect(() =>
      opsApplySchema.parse({ ...envelope, command: "cases.close", payload: { id } }),
    ).toThrow();
    expect(() =>
      opsApplySchema.parse({
        ...envelope,
        command: "segments.members",
        payload: { id, row_version: 1, mode: "add", company_ids: [id, id] },
      }),
    ).toThrow();
    expect(() =>
      opsApplySchema.parse({
        ...envelope,
        command: "segments.archive",
        payload: { id, row_version: 1, delete: true },
      }),
    ).toThrow();
    expect(() => opsApplySchema.parse({ ...envelope, command: "toString", payload: {} })).toThrow();
  });
  it("keeps local dates round-trippable and rejects invalid date normalization", () => {
    const input = localDateInput("2026-11-03T12:30:00Z");
    expect(localDateToUtc(input)).toBe("2026-11-03T12:30:00.000Z");
    expect(localDateToUtc("")).toBeNull();
    expect(() => localDateToUtc("2026-02-30T12:00")).toThrow();
  });
});
