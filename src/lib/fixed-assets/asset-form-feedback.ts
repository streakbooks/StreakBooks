import { isReportDate } from "@/lib/reports/date-validation";
import { validateAssetTerms, type DepreciationMethod } from "./depreciation";

/** Inline feedback is presentation-only. SQL/RPC validation remains authoritative. */
export type AssetInputField =
  | "name"
  | "purchase"
  | "start"
  | "cost"
  | "residual"
  | "opening"
  | "life"
  | "rate"
  | "asset"
  | "acc"
  | "exp";

export type AssetFormFeedback = {
  fields: Partial<Record<AssetInputField, string>>;
  messages: string[];
  valid: boolean;
};

export type AssetFormValues = {
  name: string;
  purchase: string;
  start: string;
  method: DepreciationMethod;
  costMinor: number | null;
  residualMinor: number | null;
  openingMinor: number | null;
  lifeMonths: number | null;
  rateBps: number | null;
  assetAccountId: string;
  accumulatedAccountId: string;
  expenseAccountId: string;
  frozen: boolean;
};

export function validateAssetFormForDisplay(values: AssetFormValues): AssetFormFeedback {
  const fields: AssetFormFeedback["fields"] = {};
  const messages: string[] = [];
  const flag = (field: AssetInputField, message: string) => {
    fields[field] = message;
    messages.push(message);
  };
  if (!values.name.trim()) flag("name", "Enter an asset name.");
  else if (values.name.trim().length > 160)
    flag("name", "Asset name cannot exceed 160 characters.");
  if (values.frozen) {
    return { fields, messages, valid: messages.length === 0 };
  }
  if (!isReportDate(values.purchase)) flag("purchase", "Enter a valid purchase date.");
  if (!isReportDate(values.start)) flag("start", "Enter a valid depreciation start date.");
  if (
    isReportDate(values.purchase) &&
    isReportDate(values.start) &&
    values.start < values.purchase
  ) {
    flag("start", "Depreciation cannot start before the purchase date.");
  }
  if (values.costMinor === null || !Number.isSafeInteger(values.costMinor)) {
    flag("cost", "Enter an exact cost amount.");
  } else if (values.costMinor <= 0 || values.costMinor > 900_000_000_000_000) {
    flag("cost", "Cost must be positive and within the supported amount limit.");
  }
  if (
    values.residualMinor === null ||
    !Number.isSafeInteger(values.residualMinor) ||
    values.residualMinor < 0
  ) {
    flag("residual", "Enter a valid residual value of zero or more.");
  }
  if (
    values.openingMinor === null ||
    !Number.isSafeInteger(values.openingMinor) ||
    values.openingMinor < 0
  ) {
    flag("opening", "Enter brought-forward depreciation of zero or more.");
  }
  if (
    values.method === "straight_line" &&
    (typeof values.lifeMonths !== "number" ||
      !Number.isInteger(values.lifeMonths) ||
      values.lifeMonths < 1 ||
      values.lifeMonths > 1200)
  ) {
    flag("life", "Useful life must be 1 to 1,200 months.");
  }
  if (
    values.method === "reducing_balance" &&
    (typeof values.rateBps !== "number" ||
      !Number.isInteger(values.rateBps) ||
      values.rateBps < 1 ||
      values.rateBps > 10000)
  ) {
    flag("rate", "Annual rate must be between 0.01% and 100%.");
  }
  if (!values.assetAccountId) flag("asset", "Choose an asset cost account.");
  if (!values.accumulatedAccountId) flag("acc", "Choose an accumulated depreciation account.");
  if (!values.expenseAccountId) flag("exp", "Choose a depreciation expense account.");
  if (
    values.assetAccountId &&
    values.accumulatedAccountId &&
    values.assetAccountId === values.accumulatedAccountId
  ) {
    flag("acc", "Asset cost and accumulated depreciation need separate accounts.");
  }
  if (
    values.costMinor !== null &&
    values.residualMinor !== null &&
    values.openingMinor !== null &&
    Number.isSafeInteger(values.costMinor) &&
    Number.isSafeInteger(values.residualMinor) &&
    Number.isSafeInteger(values.openingMinor)
  ) {
    const terms = validateAssetTerms({
      method: values.method,
      costMinor: values.costMinor,
      residualMinor: values.residualMinor,
      openingAccumulatedMinor: values.openingMinor,
      usefulLifeMonths: values.lifeMonths,
      annualRateBps: values.rateBps,
    });
    for (const issue of terms) {
      if (!messages.includes(issue)) messages.push(issue);
    }
  }
  return { fields, messages, valid: messages.length === 0 };
}
