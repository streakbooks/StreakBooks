import { describe, expect, it } from "vitest";
import { FIXED_ASSET_SECTIONS, parseFixedAssetRegisterSearch } from "./register-navigation";

describe("Fixed Assets native browsing state", () => {
  const typeId = "e8decb58-9d18-4e7c-a0d2-12226252b0d3";
  const accountId = "f72a0694-3a11-4cf7-80d3-fad7198fa273";

  it("accepts all documented fixed-asset sections as deep links", () => {
    for (const tab of FIXED_ASSET_SECTIONS) {
      expect(parseFixedAssetRegisterSearch({ tab })).toEqual({ tab });
    }
  });

  it("retains complete register filters, sorting and direction across refresh", () => {
    const input = {
      tab: "register",
      q: "Computers & office equipment",
      status: "active",
      typeId,
      accountId,
      sort: "cost",
      desc: "true",
    };
    const expected = { ...input, desc: true };
    expect(parseFixedAssetRegisterSearch(input)).toEqual(expected);
    expect(
      parseFixedAssetRegisterSearch(
        Object.fromEntries(
          new URLSearchParams(Object.entries(input).map(([key, value]) => [key, String(value)])),
        ),
      ),
    ).toEqual(expected);
  });

  it("does not retain unknown URLs, permissions or unsupported sections", () => {
    expect(
      parseFixedAssetRegisterSearch({
        tab: "../platform",
        redirect: "https://evil.example",
        admin: true,
        q: "x".repeat(121),
      }),
    ).toEqual({});
  });

  it("requires valid account and type identifiers without accepting arrays", () => {
    expect(
      parseFixedAssetRegisterSearch({
        typeId: "../other-company",
        accountId: ["f72a0694-3a11-4cf7-80d3-fad7198fa273"],
      }),
    ).toEqual({});
    expect(parseFixedAssetRegisterSearch({ typeId, accountId })).toEqual({
      typeId,
      accountId,
    });
  });

  it("rejects invalid sort, status and descending state", () => {
    expect(
      parseFixedAssetRegisterSearch({
        sort: "sql",
        status: "all-tenants",
        desc: "false",
      }),
    ).toEqual({});
    expect(
      parseFixedAssetRegisterSearch({
        sort: "purchase",
        status: "disposed",
        desc: "1",
      }),
    ).toEqual({ sort: "purchase", status: "disposed", desc: true });
  });

  it("preserves filters when moving across different native tabs", () => {
    const current = parseFixedAssetRegisterSearch({
      tab: "register",
      q: "car",
      typeId,
      sort: "name",
    });
    expect(
      parseFixedAssetRegisterSearch({
        ...current,
        tab: "depreciation",
      }),
    ).toEqual({ tab: "depreciation", q: "car", typeId, sort: "name" });
  });

  it("normalizes padded searches without losing independent register filters", () => {
    expect(parseFixedAssetRegisterSearch({ q: "  Equipment  ", status: "active" })).toEqual({
      q: "Equipment",
      status: "active",
    });
    expect(parseFixedAssetRegisterSearch({ q: "   ", sort: "name" })).toEqual({ sort: "name" });
    expect(parseFixedAssetRegisterSearch({ q: "  " + "x".repeat(120) + "  " })).toEqual({
      q: "x".repeat(120),
    });
    expect(parseFixedAssetRegisterSearch({ q: "x".repeat(121), tab: "register" })).toEqual({
      tab: "register",
    });
  });

  it("rejects invisible and bidirectional search controls while preserving Unicode", () => {
    for (const character of [
      "\n",
      "\t",
      "\u0000",
      "\u0085",
      "\u061c",
      "\u200f",
      "\u2028",
      "\u202e",
      "\u2066",
    ]) {
      expect(parseFixedAssetRegisterSearch({ q: "asset" + character, status: "disposed" })).toEqual(
        { status: "disposed" },
      );
    }
    for (const character of [
      "\u200b",
      "\u200c",
      "\u200d",
      "\u2060",
      "\u2061",
      "\u2062",
      "\u2063",
      "\u2064",
      "\ufeff",
    ]) {
      expect(parseFixedAssetRegisterSearch({ q: "asset" + character, sort: "cost" })).toEqual({
        sort: "cost",
      });
    }
    expect(parseFixedAssetRegisterSearch({ q: "  उपकरण 🧾  " })).toEqual({ q: "उपकरण 🧾" });
  });

  it("drops cleared values without carrying stale filters forward", () => {
    expect(
      parseFixedAssetRegisterSearch({
        q: "",
        typeId: "",
        accountId: "",
        status: "all",
        desc: false,
      }),
    ).toEqual({ status: "all" });
  });
});
