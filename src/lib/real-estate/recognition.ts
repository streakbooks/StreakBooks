export type RecognitionPolicy = "unset" | "point_in_time" | "over_time";
export type RecognitionTrigger = "cash" | "invoice" | "agreement" | "milestone" | "manual";

export type RecognitionAssessment = { allowed: boolean; reason: string };

/**
 * Cash, invoices, agreements and milestones never recognise revenue by themselves.
 * The ledger posting still recomputes this decision.
 */
export function assessRecognition(input: {
  policy: RecognitionPolicy;
  trigger: RecognitionTrigger;
  controlTransferred: boolean;
  overTimeCriteriaMet: boolean;
  approved: boolean;
  calculationRef: string;
  evidenceNote: string;
}): RecognitionAssessment {
  if (input.policy === "unset") {
    return {
      allowed: false,
      reason: "Choose an approved recognition policy before recognising revenue.",
    };
  }
  if (input.trigger !== "manual") {
    return {
      allowed: false,
      reason:
        "Receiving cash, issuing an invoice, signing an agreement or reaching a milestone does not recognise revenue.",
    };
  }
  if (!input.approved) {
    return { allowed: false, reason: "Revenue recognition needs an explicit approval." };
  }
  if (input.calculationRef.trim().length < 4) {
    return { allowed: false, reason: "A calculation reference is required." };
  }
  if (input.evidenceNote.trim().length < 12) {
    return { allowed: false, reason: "Describe the evidence that supports this recognition." };
  }
  if (input.policy === "point_in_time" && !input.controlTransferred) {
    return {
      allowed: false,
      reason:
        "Point-in-time recognition requires evidence that control of the property has transferred.",
    };
  }
  if (input.policy === "over_time" && !input.overTimeCriteriaMet) {
    return {
      allowed: false,
      reason: "Over-time recognition stays off until the qualifying criteria are confirmed.",
    };
  }
  return { allowed: true, reason: "The policy and evidence allow this recognition to be posted." };
}

export function recognitionAmounts(input: {
  mode: "point_in_time" | "over_time";
  contractMinor: number;
  collectedMinor: number;
  recognisedMinor: number;
  liabilityAppliedMinor: number;
  cosRecognisedMinor: number;
  requestedMinor?: number;
  progressBps?: number;
  estimatedCostMinor?: number;
}): {
  revenueMinor: number;
  fromLiabilityMinor: number;
  contractAssetMinor: number;
  cosMinor: number;
} {
  const openLiability = input.collectedMinor - input.liabilityAppliedMinor;
  if (openLiability < 0) throw new Error("Liability application exceeds collections.");
  let revenue = 0;
  let cos = 0;
  if (input.mode === "point_in_time") {
    revenue = input.requestedMinor ?? 0;
    if (!Number.isSafeInteger(revenue) || revenue <= 0) {
      throw new Error("Recognition amount must be a positive minor amount.");
    }
    if (input.recognisedMinor + revenue > input.contractMinor) {
      throw new Error("Recognition would exceed the contract.");
    }
  } else {
    const progress = input.progressBps ?? 0;
    if (!Number.isInteger(progress) || progress <= 0 || progress > 10000) {
      throw new Error("Progress must be above 0 and at most 100%.");
    }
    const target = Math.floor((input.contractMinor * progress) / 10000);
    revenue = target - input.recognisedMinor;
    if (revenue <= 0) throw new Error("Measured progress does not increase recognised revenue.");
    const estimated = input.estimatedCostMinor ?? 0;
    if (!Number.isSafeInteger(estimated) || estimated < 0) {
      throw new Error("Estimated cost must be a non-negative minor amount.");
    }
    cos = Math.max(0, Math.floor((estimated * progress) / 10000) - input.cosRecognisedMinor);
  }
  const fromLiability = Math.min(revenue, openLiability);
  return {
    revenueMinor: revenue,
    fromLiabilityMinor: fromLiability,
    contractAssetMinor: revenue - fromLiability,
    cosMinor: cos,
  };
}
