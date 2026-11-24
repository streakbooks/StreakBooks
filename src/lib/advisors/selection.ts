import type { AdvisorServiceCode } from "@/lib/advisors/catalogue";

export const ADVISORS_SELECTION_STORAGE_KEY = "streakbooks.advisors.selectedService";

export function rememberAdvisorServiceSelection(code: AdvisorServiceCode): void {
  try {
    window.sessionStorage.setItem(ADVISORS_SELECTION_STORAGE_KEY, code);
  } catch {
    // Session storage may be unavailable; URL remains the source of truth.
  }
}

export function readAdvisorServiceSelection(): AdvisorServiceCode | null {
  try {
    const value = window.sessionStorage.getItem(ADVISORS_SELECTION_STORAGE_KEY);
    return value === "bookkeeping" || value === "coaching" ? value : null;
  } catch {
    return null;
  }
}
