/** Strict, pure validation shared between the UI server function and tests. */
export function validateBudgetLockCommand(input: { locked: unknown; reason: unknown }): {
  locked: boolean;
  reason: string;
} {
  if (typeof input?.locked !== "boolean") {
    throw new Error("Choose a valid lock state.");
  }
  if (typeof input.reason !== "string") {
    throw new Error("Enter a reason between 3 and 500 characters.");
  }
  const reason = input.reason.trim();
  if (reason.length < 3 || reason.length > 500) {
    throw new Error("Enter a reason between 3 and 500 characters.");
  }
  return { locked: input.locked, reason };
}
