import { describe, expect, it } from "vitest";
import {
  nullableAssetMinorNumber,
  safeAssetMinorNumber,
} from "./amount-normalisation";

describe("Fixed Assets source amount normalization", () => {
  it("preserves small exact integers from PostgreSQL numeric, bigint and decimal string values", () => {
    expect(safeAssetMinorNumber(250, "Cost")).toBe(250);
    expect(safeAssetMinorNumber("250", "Cost")).toBe(250);
    expect(safeAssetMinorNumber(250n, "Cost")).toBe(250);
    expect(safeAssetMinorNumber("000250", "Cost")).toBe(250);
    expect(safeAssetMinorNumber("9007199254740991", "Cost")).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("fails closed on unsafe JSON numeric values before they reach a UI", () => {
    expect(() => safeAssetMinorNumber(Number.MAX_SAFE_INTEGER + 1, "Cost"))
      .toThrow(/precision/i);
    expect(() => safeAssetMinorNumber(1.5, "Cost"))
      .toThrow(/precision/i);
    expect(() => safeAssetMinorNumber(Number.POSITIVE_INFINITY, "Cost"))
      .toThrow(/precision/i);
    expect(() => safeAssetMinorNumber(Number.NaN, "Cost"))
      .toThrow(/precision/i);
  });

  it("never rounds a PostgreSQL BIGINT decimal string into a JavaScript number", () => {
    expect(() => safeAssetMinorNumber("9007199254740992", "Cost"))
      .toThrow(/precision/i);
    expect(() => safeAssetMinorNumber(9007199254740993n, "Cost"))
      .toThrow(/precision/i);
    expect(() => safeAssetMinorNumber("999999999999999999999999999", "Cost"))
      .toThrow(/precision/i);
  });

  it("refuses malformed and implicitly zeroed amounts", () => {
    for (const input of [null, undefined, "", "1.5", "12e3", "1 000", {}, [], true]) {
      expect(() => safeAssetMinorNumber(input, "Cost")).toThrow(/exact whole/i);
    }
  });

  it("rejects negatives and enforces positive acquisition/posted amounts", () => {
    expect(() => safeAssetMinorNumber(-1, "Cost")).toThrow(/at least/i);
    expect(() => safeAssetMinorNumber("-5", "Cost")).toThrow(/at least/i);
    expect(() => safeAssetMinorNumber(0, "Cost", { minimum: 1 }))
      .toThrow(/at least 1/i);
    expect(safeAssetMinorNumber("1", "Cost", { minimum: 1 })).toBe(1);
  });

  it("allows genuine zero depreciation for not-due and fully depreciated previews", () => {
    expect(safeAssetMinorNumber(0, "Depreciation charge")).toBe(0);
    expect(safeAssetMinorNumber("0", "Accumulated depreciation after run")).toBe(0);
  });

  it("accepts null only for nullable disposal proceeds", () => {
    expect(nullableAssetMinorNumber(null, "Disposal proceeds")).toBeNull();
    expect(nullableAssetMinorNumber("0", "Disposal proceeds")).toBe(0);
    expect(nullableAssetMinorNumber("1250", "Disposal proceeds")).toBe(1250);
    expect(() => nullableAssetMinorNumber(undefined, "Disposal proceeds"))
      .toThrow(/exact whole/i);
  });

  it("rejects invalid minimum configurations", () => {
    expect(() => safeAssetMinorNumber("1", "Cost", { minimum: -1 }))
      .toThrow(/minimum/i);
    expect(() => safeAssetMinorNumber("1", "Cost", { minimum: 0.5 }))
      .toThrow(/minimum/i);
  });
});
