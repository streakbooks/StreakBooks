import { describe, expect, it } from "vitest";
import {
  auditFxRevaluationRun,
  type FxRunAuditAccount,
  type FxRunAuditJournal,
  type FxRunAuditLine,
  type FxRunAuditReversal,
  type FxRunAuditSource,
  type FxRunAuditTag,
} from "./fx-revaluation-ledger-audit";

const run: FxRunAuditSource = {
  id: "run1",
  as_of_date: "2026-10-31",
  reverse_on: "2026-11-01",
  journal_ids: ["j1"],
  total_gain_minor: "500",
  total_loss_minor: "0",
};
const journal: FxRunAuditJournal = {
  id: "j1",
  status: "posted",
  journal_date: "2026-10-31",
  source_type: "fx_revaluation",
  source_id: "run1",
  idempotency_key: "fx_reval:run1:USD",
  currency_code: "GBP",
  fx_rate_to_base: "1.00000000",
  reverses_journal_id: null,
  reversed_by_journal_id: null,
};
const tag: FxRunAuditTag = { journal_id: "j1", kind: "revaluation", currency_code: "USD" };
const queue: FxRunAuditReversal = {
  journal_id: "j1",
  origin: "fx_revaluation",
  reverse_on: "2026-11-01",
  status: "pending",
  reversal_journal_id: null,
};
const lines: FxRunAuditLine[] = [
  { journal_id: "j1", account_id: "receivable", debit_minor: "500", credit_minor: "0" },
  { journal_id: "j1", account_id: "gain", debit_minor: "0", credit_minor: "500" },
];
const accounts: FxRunAuditAccount[] = [
  { id: "receivable", code: "1100", name: "Trade receivables", account_type: "asset" },
  { id: "gain", code: "7720", name: "Unrealised FX gains", account_type: "income" },
];
const check = (
  source: FxRunAuditSource = run,
  journals: FxRunAuditJournal[] = [journal],
  reversals: FxRunAuditReversal[] = [queue],
  gl: FxRunAuditLine[] = lines,
  tags: FxRunAuditTag[] = [tag],
  mappedAccounts: FxRunAuditAccount[] = accounts,
) => auditFxRevaluationRun(source, "GBP", journals, tags, reversals, gl, mappedAccounts);

describe("unrealised FX revaluation to ledger audit", () => {
  it("matches a balanced base-currency journal and the exact gain total", () => {
    const result = check();
    expect(result.exceptionCount).toBe(0);
    expect(result.items[0]).toMatchObject({
      status: "matched",
      currencyCode: "USD",
      gainMinor: "500",
      lossMinor: "0",
    });
    expect(result.actualGainMinor).toBe("500");
    expect(result.actualLossMinor).toBe("0");
  });

  it("verifies that a completed reversal cancels all original account effects", () => {
    const reverse: FxRunAuditJournal = {
      ...journal,
      id: "rev1",
      reverses_journal_id: "j1",
      reversed_by_journal_id: null,
      source_type: "manual",
    };
    const reversalLines: FxRunAuditLine[] = [
      { journal_id: "rev1", account_id: "receivable", debit_minor: "0", credit_minor: "500" },
      { journal_id: "rev1", account_id: "gain", debit_minor: "500", credit_minor: "0" },
    ];
    const result = check(
      run,
      [{ ...journal, reversed_by_journal_id: "rev1" }, reverse],
      [{ ...queue, status: "done", reversal_journal_id: "rev1" }],
      [...lines, ...reversalLines],
    );
    expect(result.exceptionCount).toBe(0);
    expect(result.reversedCount).toBe(1);
    expect(result.items[0]!.status).toBe("reversed");
    const bad = check(
      run,
      [{ ...journal, reversed_by_journal_id: "rev1" }, reverse],
      [{ ...queue, status: "done", reversal_journal_id: "rev1" }],
      [...lines, { ...reversalLines[0]!, credit_minor: "499" }, reversalLines[1]!],
    );
    expect(bad.items[0]!.issues).toContain(
      "Reversal does not cancel the original journal amounts by account.",
    );
  });

  it("detects wrong journal source, date, FX rate, currency tag and GL gain totals", () => {
    const result = check(
      { ...run, total_gain_minor: "600" },
      [{ ...journal, source_id: "someone-else", journal_date: "2026-11-01", fx_rate_to_base: 1.1 }],
      [queue],
      lines,
      [{ ...tag, currency_code: "EUR" }],
    );
    expect(result.exceptionCount).toBeGreaterThan(0);
    expect(result.differences).toContain(
      "Incomplete journal evidence prevents a reliable gain/loss total.",
    );
    expect(result.actualGainMinor).toBeNull();
    expect(result.items[0]!.issues).toContain(
      "Journal idempotency key does not match its run and currency.",
    );
  });

  it("rejects unsafe minor units, missing journals and unrelated P&L accounts", () => {
    const unknown = check(run, [], [queue], lines);
    expect(unknown.actualGainMinor).toBeNull();
    expect(unknown.items[0]!.status).toBe("exception");

    const unsafe = check(
      run,
      [journal],
      [queue],
      [{ ...lines[0]!, debit_minor: Number.MAX_SAFE_INTEGER + 1 }, lines[1]!],
    );
    expect(unsafe.actualGainMinor).toBeNull();

    const wrongAccount = check(
      run,
      [journal],
      [queue],
      lines,
      [tag],
      [{ ...accounts[0]!, account_type: "expense" }, accounts[1]!],
    );
    expect(wrongAccount.items[0]!.issues).toContain(
      "Unexpected profit-and-loss account in the revaluation journal.",
    );
  });

  it("rejects revaluation adjustments posted against equity accounts", () => {
    const result = check(
      run,
      [journal],
      [queue],
      lines,
      [tag],
      [{ ...accounts[0]!, account_type: "equity" }, accounts[1]!],
    );
    expect(result.actualGainMinor).toBeNull();
    expect(result.items[0]!.issues).toContain(
      "Revaluation adjustment must affect an asset or liability account.",
    );
  });

  it("flags missing and failed reversal work rather than silently reporting balanced", () => {
    expect(check(run, [journal], []).items[0]!.issues).toContain(
      "Scheduled automatic reversal is missing.",
    );
    expect(check(run, [journal], [{ ...queue, status: "failed" }]).exceptionCount).toBe(1);
    expect(check({ ...run, journal_ids: [] }).differences).toContain(
      "A posted revaluation run has no linked journals.",
    );
  });

  it("uses exact bigint arithmetic with values above the JS safe integer threshold", () => {
    const large = "9007199254740993";
    const result = check(
      { ...run, total_gain_minor: large },
      [journal],
      [queue],
      [
        { ...lines[0]!, debit_minor: large },
        { ...lines[1]!, credit_minor: large },
      ],
    );
    expect(result.exceptionCount).toBe(0);
    expect(result.actualGainMinor).toBe(large);
  });

  it("reconciles distinct USD gains and EUR losses in a single run", () => {
    const eurJournal: FxRunAuditJournal = {
      ...journal,
      id: "j2",
      idempotency_key: "fx_reval:run1:EUR",
    };
    const result = check(
      {
        ...run,
        journal_ids: ["j1", "j2"],
        total_gain_minor: "500",
        total_loss_minor: "200",
      },
      [journal, eurJournal],
      [queue, { ...queue, journal_id: "j2" }],
      [
        ...lines,
        { journal_id: "j2", account_id: "receivable", debit_minor: "0", credit_minor: "200" },
        { journal_id: "j2", account_id: "loss", debit_minor: "200", credit_minor: "0" },
      ],
      [tag, { journal_id: "j2", kind: "revaluation", currency_code: "EUR" }],
      [
        ...accounts,
        { id: "loss", code: "7730", name: "Unrealised FX losses", account_type: "expense" },
      ],
    );
    expect(result.exceptionCount).toBe(0);
    expect(result.journalCount).toBe(2);
    expect(result.actualGainMinor).toBe("500");
    expect(result.actualLossMinor).toBe("200");
  });

  it("rejects two run journals for the same foreign currency", () => {
    const duplicateJournal: FxRunAuditJournal = {
      ...journal,
      id: "j2",
    };
    const duplicatedLines: FxRunAuditLine[] = lines.map((line) => ({
      ...line,
      journal_id: "j2",
    }));
    const result = check(
      { ...run, journal_ids: ["j1", "j2"], total_gain_minor: "1000" },
      [journal, duplicateJournal],
      [queue, { ...queue, journal_id: "j2" }],
      [...lines, ...duplicatedLines],
      [tag, { ...tag, journal_id: "j2" }],
    );
    expect(result.items[1]!.issues).toContain(
      "Multiple journals represent the same foreign currency in this run.",
    );
    expect(result.actualGainMinor).toBeNull();
  });

  it("rejects a base-currency revaluation tag and invalid gain journal line side", () => {
    const wrongCurrency = check(
      run,
      [journal],
      [queue],
      lines,
      [{ ...tag, currency_code: "GBP" }],
    );
    expect(wrongCurrency.items[0]!.issues).toContain(
      "Revaluation currency must differ from the organisation base currency.",
    );
    expect(wrongCurrency.actualGainMinor).toBeNull();

    const crossed = check(
      run,
      [journal],
      [queue],
      [
        { ...lines[0]!, debit_minor: "499" },
        { ...lines[1]!, debit_minor: "1", credit_minor: "500" },
      ],
    );
    expect(crossed.items[0]!.issues).toContain(
      "Unrealised gain was posted to an incorrect account or debit side.",
    );
    expect(crossed.actualGainMinor).toBeNull();
  });

  it("supports a zero-net revaluation currency and a valid loss account", () => {
    const lossAccount: FxRunAuditAccount = {
      id: "loss",
      code: "7730",
      name: "Unrealised FX losses",
      account_type: "expense",
    };
    const result = check(
      { ...run, total_gain_minor: "0", total_loss_minor: "200" },
      [journal],
      [queue],
      [
        { ...lines[0]!, debit_minor: "0", credit_minor: "200" },
        { ...lines[1]!, account_id: "loss", debit_minor: "200", credit_minor: "0" },
      ],
      [tag],
      [accounts[0]!, lossAccount],
    );
    expect(result.exceptionCount).toBe(0);
    expect(result.actualLossMinor).toBe("200");
  });
});
