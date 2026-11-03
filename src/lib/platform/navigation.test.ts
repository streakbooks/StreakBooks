import { describe, expect, it } from "vitest";
import {
  parsePlatformSearch,
  platformSearchSchema,
  recordReference,
  searchDestination,
} from "./navigation";
const id = "20000000-0000-4000-8000-000000000001";
describe("platform navigation", () => {
  it("keeps only valid identifiers on supported record sections", () => {
    expect(Object.hasOwn(parsePlatformSearch({ section: "users", record: "bad" }), "record")).toBe(
      true,
    );
    expect(parsePlatformSearch({ section: "businesses", record: id })).toEqual({
      section: "businesses",
      record: id,
    });
    expect(parsePlatformSearch({ section: "users", record: "../../../ledger" })).toEqual({
      section: "users",
    });
    expect(parsePlatformSearch({ section: "billing", record: id })).toEqual({ section: "billing" });
    expect(parsePlatformSearch({ section: "invented", record: id })).toEqual({
      section: "overview",
    });
  });
  it("maps search kinds to real record URLs", () => {
    expect(searchDestination({ kind: "firm", id, label: "Firm" })).toEqual({
      section: "firms",
      record: id,
    });
    expect(searchDestination({ kind: "user", id, label: "User" })).toEqual({
      section: "users",
      record: id,
    });
  });
  it("renders related-record links only for permitted resources and valid IDs", () => {
    expect(recordReference("company_id", id, ["businesses.view"])).toEqual({
      section: "businesses",
      record: id,
    });
    expect(recordReference("company_id", id, ["firms.view"])).toBeUndefined();
    expect(recordReference("user_id", "not-a-uuid", ["users.view"])).toBeUndefined();
    expect(recordReference("id", id, ["businesses.view"])).toBeUndefined();
  });
  it("validates search size before an RPC", () => {
    expect(platformSearchSchema.safeParse({ query: " " }).success).toBe(false);
    expect(platformSearchSchema.safeParse({ query: "😀" }).success).toBe(false);
    expect(platformSearchSchema.safeParse({ query: "a".repeat(161) }).success).toBe(false);
    expect(platformSearchSchema.parse({ query: " Example " }).query).toBe("Example");
  });
});
