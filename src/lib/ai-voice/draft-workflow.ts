import { z } from "zod";

/** Pure, deterministic guided-entry state machine. No persistence or accounting writes. */
export const DraftKind = z.enum(["sales_invoice", "supplier_bill"]);
export const DraftField = z.enum(["contact", "reference", "amount_minor", "due_date"]);
export const DraftState = z.object({
  version: z.literal(1),
  kind: DraftKind,
  step: DraftField,
  values: z.object({
    contact: z.string().min(1).max(200).optional(),
    reference: z.string().min(1).max(100).optional(),
    amount_minor: z.number().int().positive().safe().optional(),
    due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }),
  status: z.enum(["collecting", "review", "cancelled"]),
});
export type DraftState = z.infer<typeof DraftState>;
const sequence = DraftField.options;
const required = (field: z.infer<typeof DraftField>) => ({
  contact: "Which customer or supplier?",
  reference: "What is the document reference?",
  amount_minor: "What is the amount? Enter a decimal number in the organisation's currency.",
  due_date: "What is the due date? Use YYYY-MM-DD.",
})[field];

export function beginDraft(kind: z.infer<typeof DraftKind>): { state: DraftState; response: string } {
  return { state: { version: 1, kind, step: "contact", values: {}, status: "collecting" }, response: required("contact") };
}
function parseValue(field: z.infer<typeof DraftField>, raw: string): DraftState["values"][typeof field] {
  const value = raw.trim();
  if (field === "contact") return z.string().min(1).max(200).parse(value);
  if (field === "reference") return z.string().min(1).max(100).parse(value);
  if (field === "amount_minor") {
    // Currency minor units only. Reject spoken/ambiguous amounts and exponents.
    if (!/^(?:0|[1-9]\d{0,10})(?:\.\d{1,2})?$/.test(value)) throw new Error("Use an unambiguous decimal amount, such as 1250.50.");
    const [whole, fraction = ""] = value.split(".");
    const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error("Enter a positive amount.");
    return amount;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(value).toISOString().slice(0, 10) !== value) {
    throw new Error("Use a valid YYYY-MM-DD date.");
  }
  return value;
}
export function advanceDraft(stateInput: DraftState, utterance: string): { state: DraftState; response: string } {
  const state = DraftState.parse(stateInput);
  const text = utterance.trim();
  if (state.status === "cancelled") return { state, response: "This draft workflow has been cancelled." };
  if (/^cancel$/i.test(text)) return {
    state: { ...state, status: "cancelled" },
    response: "Draft workflow cancelled. No accounting record was saved.",
  };
  if (/^(go back|back)$/i.test(text)) {
    const index = sequence.indexOf(state.step);
    const previous = sequence[Math.max(0, index - 1)]!;
    return { state: { ...state, step: previous, status: "collecting" }, response: required(previous) };
  }
  if (state.status === "review") return {
    state, response: "This is a preview only. Saving requires the authorised server-side draft service.",
  };
  try {
    const parsed = parseValue(state.step, text);
    const values = { ...state.values, [state.step]: parsed };
    const index = sequence.indexOf(state.step);
    if (index === sequence.length - 1) return {
      state: { ...state, values, status: "review" },
      response: `Review ${state.kind === "sales_invoice" ? "sales invoice" : "supplier bill"}: contact ${values.contact}; reference ${values.reference}; amount minor units ${values.amount_minor}; due ${values.due_date}. This is NOT saved or posted.`,
    };
    const next = sequence[index + 1]!;
    return { state: { ...state, values, step: next }, response: required(next) };
  } catch (error) {
    return { state, response: error instanceof Error ? error.message : "Invalid value." };
  }
}
