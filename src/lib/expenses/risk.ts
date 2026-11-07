export type ExpenseRiskSeverity = "low" | "medium" | "high";

export type ExpenseRiskFlag = {
  code: string;
  severity: ExpenseRiskSeverity;
  message: string;
};

export type ExpenseClaimRiskScan = {
  claimId: string;
  score: number;
  flags: ExpenseRiskFlag[];
  ocrAvailable: boolean;
  ocrNote: string;
};

export type ExpenseClaimDuplicateMatch = {
  claimId: string;
  claimNumber: string;
  approvalStatus: string;
  totalMinor: number;
  claimCurrency: string;
  claimDate: string;
  score: number;
};

export type ExpenseCategorySuggestion = {
  suggested: boolean;
  merchantName?: string;
  categoryId?: string;
  categoryName?: string;
  priorUses?: number;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function num(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

export function mapExpenseClaimRiskScan(row: unknown): ExpenseClaimRiskScan {
  const r = asRecord(row);
  const flagsRaw = Array.isArray(r["flags"]) ? r["flags"] : [];
  return {
    claimId: str(r["claim_id"] ?? r["claimId"]),
    score: Math.min(100, Math.max(0, num(r["score"]))),
    flags: flagsRaw.map((flag) => {
      const f = asRecord(flag);
      const severity = str(f["severity"], "low") as ExpenseRiskSeverity;
      return {
        code: str(f["code"]),
        severity:
          severity === "high" || severity === "medium" || severity === "low" ? severity : "low",
        message: str(f["message"]),
      };
    }),
    ocrAvailable: Boolean(r["ocr_available"] ?? r["ocrAvailable"]),
    ocrNote: str(
      r["ocr_note"] ?? r["ocrNote"],
      "Receipt OCR is not configured for this organisation yet.",
    ),
  };
}

export function mapExpenseClaimDuplicates(row: unknown): ExpenseClaimDuplicateMatch[] {
  const r = asRecord(row);
  const list = Array.isArray(r["duplicates"]) ? r["duplicates"] : [];
  return list.map((item) => {
    const d = asRecord(item);
    return {
      claimId: str(d["claim_id"] ?? d["claimId"]),
      claimNumber: str(d["claim_number"] ?? d["claimNumber"]),
      approvalStatus: str(d["approval_status"] ?? d["approvalStatus"]),
      totalMinor: num(d["total_minor"] ?? d["totalMinor"]),
      claimCurrency: str(d["claim_currency"] ?? d["claimCurrency"]).toUpperCase(),
      claimDate: str(d["claim_date"] ?? d["claimDate"]),
      score: num(d["score"]),
    };
  });
}

export function mapExpenseCategorySuggestion(row: unknown): ExpenseCategorySuggestion {
  const r = asRecord(row);
  const merchantName = str(r["merchant_name"] ?? r["merchantName"]);
  if (!r["suggested"]) {
    return { suggested: false, ...(merchantName ? { merchantName } : {}) };
  }
  const categoryId = str(r["category_id"] ?? r["categoryId"]);
  const categoryName = str(r["category_name"] ?? r["categoryName"]);
  return {
    suggested: true,
    ...(merchantName ? { merchantName } : {}),
    ...(categoryId ? { categoryId } : {}),
    ...(categoryName ? { categoryName } : {}),
    priorUses: num(r["prior_uses"] ?? r["priorUses"]),
  };
}

/** Client-side risk score band for badges. */
export function riskScoreBand(score: number): "clear" | "review" | "elevated" {
  if (score >= 50) return "elevated";
  if (score >= 20) return "review";
  return "clear";
}

/** Pure helper used when building offline/local previews before RPCs. */
export function evaluateLocalRiskHints(input: {
  totalMinor: number;
  requireReceiptAboveMinor: number;
  hasAttachment: boolean;
  lineDates: string[];
  lineGrossMinors: number[];
}): ExpenseRiskFlag[] {
  const flags: ExpenseRiskFlag[] = [];
  if (
    input.requireReceiptAboveMinor > 0 &&
    input.totalMinor >= input.requireReceiptAboveMinor &&
    !input.hasAttachment
  ) {
    flags.push({
      code: "missing_receipt",
      severity: "high",
      message: "Claim is at/above the receipt threshold but has no attachment",
    });
  }
  const weekend = input.lineDates.filter((iso) => {
    const day = new Date(`${iso}T00:00:00Z`).getUTCDay();
    return day === 0 || day === 6;
  }).length;
  if (weekend > 0) {
    flags.push({
      code: "weekend_expense",
      severity: "low",
      message: `${weekend} line(s) dated on a weekend`,
    });
  }
  const round = input.lineGrossMinors.filter((n) => n >= 10000 && n % 10000 === 0).length;
  if (round > 0) {
    flags.push({
      code: "round_amount",
      severity: "low",
      message: `${round} large round-amount line(s)`,
    });
  }
  return flags;
}
