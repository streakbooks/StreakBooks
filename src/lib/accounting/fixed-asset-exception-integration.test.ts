import { describe, expect, it } from "vitest";
import {
  createExceptionSnapshot,
  exceptionSnapshotCsv,
  filterExceptionFindings,
  type ExceptionInputs,
} from "./reconciliation-exceptions";
import type {
  AssetDepreciationPostingReview,
  AssetDisposalPostingReview,
} from "./fixed-asset-posting-evidence";

const empty: ExceptionInputs = {
  ledger: { state: "not_run" },
  realisedFx: { state: "not_run" },
  revaluation: { state: "not_run" },
  deferrals: { state: "not_run" },
  payroll: { state: "not_run" },
};
const depreciation: AssetDepreciationPostingReview = {
  status: "matched",
  runId: "run-a",
  journalId: "journal-a",
  currency: "GBP",
  entryCount: 2,
  glLineCount: 4,
  expectedTotalMinor: "150",
  registeredTotalMinor: "150",
  postedDebitMinor: "150",
  postedCreditMinor: "150",
  accountSides: [],
  issues: [],
};
const disposal: AssetDisposalPostingReview = {
  status: "partial",
  assetId: "asset-a",
  journalId: "journal-d",
  currency: "GBP",
  depreciationEntryCount: 3,
  accumulatedMinor: "450",
  costMinor: "1000",
  netBookValueMinor: "550",
  proceedsMinor: "600",
  gainLossMinor: "50",
  postedDebitMinor: "1050",
  postedCreditMinor: "1050",
  issues: [],
  warnings: ["Proceeds and gain/loss account classifications require review."],
};

describe("Fixed Asset evidence in Accounting exception aggregation", () => {
  it("retains not-run coverage for Fixed Assets before a user selects a posting", () => {
    const result = createExceptionSnapshot(empty);
    expect(result.coverage.find((x) => x.source === "fixed_assets")).toMatchObject({
      state: "not_run",
      checkedCount: null,
    });
    expect(result.fullyVerified).toBe(false);
  });

  it("treats a matching depreciation run as PARTIAL PORTFOLIO coverage, not a globally checked source", () => {
    const result = createExceptionSnapshot({
      ...empty,
      fixedAssets: {
        state: "checked",
        result: { kind: "depreciation", evidence: depreciation },
      },
    });
    expect(result.findings).toHaveLength(0);
    expect(result.fullyVerified).toBe(false);
    expect(result.coverage.find((x) => x.source === "fixed_assets")).toMatchObject({
      state: "partial",
      checkedCount: 2,
    });
  });

  it("normalizes depreciation run issues with stable keys and original source journal drilldowns", () => {
    const result = createExceptionSnapshot({
      ...empty,
      fixedAssets: {
        state: "checked",
        result: {
          kind: "depreciation",
          evidence: {
            ...depreciation,
            status: "exceptions",
            issues: [
              "One asset is missing a source GL line.",
              "Posted depreciation account differs from source.",
            ],
          },
        },
      },
    });
    expect(result.errors).toBe(2);
    expect(result.warnings).toBe(0);
    expect(result.findings[0]).toMatchObject({
      source: "fixed_assets",
      key: "fixed_assets:depreciation:run-a:issue:0",
      severity: "error",
      reference: "run-a",
      journalId: "journal-a",
      href: "/fixed-assets",
    });
    expect(result.findings[1]?.detail).toMatch(/Posted depreciation account differs/);
  });

  it("shows a matched-limited disposal audit as a warning and never a full pass", () => {
    const result = createExceptionSnapshot({
      ...empty,
      fixedAssets: {
        state: "checked",
        result: { kind: "disposal", evidence: disposal },
      },
    });
    expect(result.errors).toBe(0);
    expect(result.warnings).toBe(1);
    expect(result.fullyVerified).toBe(false);
    expect(result.coverage.find((x) => x.source === "fixed_assets")).toMatchObject({
      state: "partial",
      checkedCount: 3,
    });
    expect(result.findings[0]).toMatchObject({
      source: "fixed_assets",
      severity: "warning",
      reference: "asset-a",
      journalId: "journal-d",
      key: "fixed_assets:disposal:asset-a:warning:0",
    });
  });

  it("preserves disposal exceptions as errors alongside classification warnings", () => {
    const result = createExceptionSnapshot({
      ...empty,
      fixedAssets: {
        state: "checked",
        result: {
          kind: "disposal",
          evidence: {
            ...disposal,
            status: "exceptions",
            issues: ["Disposal asset cost GL credit missing."],
          },
        },
      },
    });
    expect(result.errors).toBe(1);
    expect(result.warnings).toBe(1);
    expect(result.findings.find((x) => x.severity === "error")?.journalId).toBe("journal-d");
  });

  it("does not convert missing or permission-denied audit evidence into a pass", () => {
    const missing = createExceptionSnapshot({
      ...empty,
      fixedAssets: { state: "checked" },
    });
    expect(missing.coverage.find((x) => x.source === "fixed_assets")?.state).toBe("unavailable");
    const denied = createExceptionSnapshot({
      ...empty,
      fixedAssets: { state: "unavailable", message: "Permission denied" },
    });
    expect(denied.coverage.find((x) => x.source === "fixed_assets")?.note).toContain(
      "Permission denied",
    );
    expect(denied.fullyVerified).toBe(false);
  });

  it("keeps Fixed Asset findings filterable and exportable with source and journal references", () => {
    const snapshot = createExceptionSnapshot({
      ...empty,
      fixedAssets: {
        state: "checked",
        result: {
          kind: "depreciation",
          evidence: {
            ...depreciation,
            status: "exceptions",
            issues: ["Account mismatch"],
          },
        },
      },
    });
    const filtered = filterExceptionFindings(
      snapshot.findings,
      {
        source: "fixed_assets",
        severity: "error",
        search: "RUN-A",
        review: "unreviewed",
      },
      new Set(),
    );
    expect(filtered).toHaveLength(1);
    const csv = exceptionSnapshotCsv(snapshot, new Set());
    expect(csv).toContain("Fixed assets");
    expect(csv).toContain("journal-a");
    expect(csv).toContain("run-a");
    expect(csv).toContain("partial");
  });

  it("does not allow a session review checkbox to change underlying audit evidence", () => {
    const snapshot = createExceptionSnapshot({
      ...empty,
      fixedAssets: {
        state: "checked",
        result: {
          kind: "depreciation",
          evidence: {
            ...depreciation,
            status: "exceptions",
            issues: ["Missing GL line"],
          },
        },
      },
    });
    const reviewed = new Set([snapshot.findings[0]!.key]);
    expect(
      filterExceptionFindings(
        snapshot.findings,
        {
          source: "all",
          severity: "all",
          search: "",
          review: "reviewed",
        },
        reviewed,
      ),
    ).toHaveLength(1);
    expect(snapshot.errors).toBe(1);
    expect(snapshot.fullyVerified).toBe(false);
  });
});
