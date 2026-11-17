/** Local suggestions. Callers must load permissioned, company-scoped inputs. */
import { ruleMatchesTransaction, type BankRuleDef } from "./rules";

export type CodingHistoryRow = {
  payee_normalized: string;
  offset_account_id: string;
  direction: "in" | "out";
  times_used: number;
  account_code: string | null;
  account_name: string | null;
};

export type BankRuleRow = Partial<BankRuleDef> & {
  id: string;
  name: string;
  match_field: string;
  match_pattern: string;
  match_type: string;
  offset_account_id: string;
  priority: number;
  is_active: boolean;
  account_code: string | null;
  account_name: string | null;
};

export type Suggestion = {
  offsetAccountId: string;
  accountCode: string | null;
  accountName: string | null;
  /** Heuristic ranking weight, never a calibrated probability. */
  confidence: number;
  matchStrength: "exact history" | "similar history" | "explicit rule";
  conflictingHistory: boolean;
  reason: string;
  source: "history" | "rule" | "none";
  ruleId: string | null;
};

export function normalizePayee(description: string | null | undefined): string {
  return (description ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

export function directionFromAmount(amountMinor: number | bigint): "in" | "out" {
  const n = typeof amountMinor === "bigint" ? amountMinor : BigInt(amountMinor);
  return n >= 0n ? "in" : "out";
}

/**
 * Rank suggestions: exact history for payee+direction, then bank rules by priority.
 */
export function rankCodingSuggestions(opts: {
  description: string | null;
  amountMinor: number;
  history: CodingHistoryRow[];
  rules: BankRuleRow[];
  bankAccountId?: string;
  reference?: string | null;
  payee?: string | null;
  limit?: number;
}): Suggestion[] {
  const payee = normalizePayee(opts.description);
  const direction = directionFromAmount(opts.amountMinor);
  const out: Suggestion[] = [];

  const limit = Math.max(
    1,
    Math.min(10, Number.isFinite(opts.limit) ? Math.trunc(opts.limit!) : 4),
  );
  const hist = opts.history
    .filter(
      (h) =>
        h.direction === direction &&
        Number.isSafeInteger(h.times_used) &&
        h.times_used > 0 &&
        Boolean(payee && h.payee_normalized) &&
        (h.payee_normalized === payee ||
          (payee && h.payee_normalized && ` ${payee} `.includes(` ${h.payee_normalized} `))),
    )
    .sort(
      (a, b) =>
        Number(b.payee_normalized === payee) - Number(a.payee_normalized === payee) ||
        b.times_used - a.times_used ||
        a.offset_account_id.localeCompare(b.offset_account_id),
    );
  const conflictingHistory = new Set(hist.map((h) => h.offset_account_id)).size > 1;

  for (const h of hist) {
    if (out.some((s) => s.offsetAccountId === h.offset_account_id)) continue;
    const exact = h.payee_normalized === payee;
    out.push({
      offsetAccountId: h.offset_account_id,
      accountCode: h.account_code,
      accountName: h.account_name,
      confidence: exact ? Math.min(0.95, 0.55 + h.times_used * 0.05) : 0.45,
      reason: exact
        ? `Previously coded “${h.payee_normalized}” ${h.times_used} time(s) to this account`
        : `Similar payee history (“${h.payee_normalized}”)`,
      matchStrength: exact ? "exact history" : "similar history",
      conflictingHistory,
      source: "history",
      ruleId: null,
    });
  }

  const matchingRules = opts.rules
    .filter((r) =>
      ruleMatchesTransaction(
        {
          direction: "any",
          min_amount_minor: null,
          max_amount_minor: null,
          bank_account_id: null,
          tax_code_id: null,
          contact_id: null,
          ...r,
        },
        {
          bankAccountId: opts.bankAccountId ?? "",
          amountMinor: opts.amountMinor,
          description: opts.description,
          reference: opts.reference ?? null,
          payee: opts.payee ?? null,
        },
      ),
    )
    .sort(
      (a, b) => a.priority - b.priority || a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
    );

  for (const r of matchingRules) {
    if (out.some((s) => s.offsetAccountId === r.offset_account_id)) continue;
    out.push({
      offsetAccountId: r.offset_account_id,
      accountCode: r.account_code,
      accountName: r.account_name,
      confidence: 0.7,
      reason: `Bank rule “${r.name}” (${r.match_type} ${r.match_pattern})`,
      matchStrength: "explicit rule",
      conflictingHistory,
      source: "rule",
      ruleId: r.id,
    });
  }

  return out.sort((a, b) => b.confidence - a.confidence).slice(0, limit);
}
