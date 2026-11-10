/** Normalise an Advisors plan identifier before catalogue insertion. */
export function normalizeAdvisorPlanCode(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

export function canAddAdvisorPlanCode(value: string, existingCodes: readonly string[]): boolean {
  const code = normalizeAdvisorPlanCode(value);
  return /^[a-z][a-z0-9_]{0,63}$/.test(code) && !existingCodes.some((existing) => existing.toLowerCase() === code);
}
