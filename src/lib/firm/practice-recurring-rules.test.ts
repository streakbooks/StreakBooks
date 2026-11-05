import { describe, expect, it } from "vitest";
import { compatiblePracticeRecurring, practiceDraftDue } from "./practice-recurring-rules";

const engagement = {
  status: "active" as const,
  frequency: "monthly" as const,
  agreed_fee: "300",
  currency_code: "AUD",
};
const schedule = {
  id: "x",
  name: "Bookkeeping",
  company_id: "a",
  frequency: "monthly",
  next_due_date: "2026-11-01",
  is_active: true,
  auto_authorise: false,
  currency_code: "AUD",
};

describe("firm practice billing safeguards", () => {
  it("allows active compatible draft-only schedules", () => {
    expect(compatiblePracticeRecurring(engagement, schedule)).toBe(true);
    expect(practiceDraftDue(schedule, "2026-11-04")).toBe(true);
  });
  it("blocks automatic authorisation, inactive templates and future occurrences", () => {
    const auto = compatiblePracticeRecurring(engagement, { ...schedule, auto_authorise: true });
    expect(auto).toBe(false);
    expect(practiceDraftDue({ ...schedule, auto_authorise: true }, "2026-11-04")).toBe(false);
    const future = practiceDraftDue({ ...schedule, next_due_date: "2026-12-01" }, "2026-11-04");
    expect(future).toBe(false);
    expect(compatiblePracticeRecurring(engagement, { ...schedule, is_active: false })).toBe(false);
  });
  it("rejects mismatched currencies, frequencies and inactive engagements", () => {
    const currency = compatiblePracticeRecurring(engagement, { ...schedule, currency_code: "USD" });
    expect(currency).toBe(false);
    const frequency = compatiblePracticeRecurring(engagement, { ...schedule, frequency: "yearly" });
    expect(frequency).toBe(false);
    const cancelled = compatiblePracticeRecurring({ ...engagement, status: "cancelled" }, schedule);
    expect(cancelled).toBe(false);
    const once = compatiblePracticeRecurring({ ...engagement, frequency: "one_off" }, schedule);
    expect(once).toBe(false);
  });
});
