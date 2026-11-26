import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ReadOnlyAccountingWorkflowSafeguards } from "./SettingsAccountingLocksPanel";

describe("Accounting workflow safeguards", () => {
  it("shows the current values as partial and disables controls until workflows enforce them", () => {
    const markup = renderToStaticMarkup(
      <ReadOnlyAccountingWorkflowSafeguards
        warnDuplicateNumbers={false}
        warnControlAccounts={true}
        warnBankPosting={false}
        backdatedDays="90"
        autoApplyCredits={false}
      />,
    );

    expect(markup).toContain('data-settings-status="partial"');
    expect(markup).toContain("Workflow safeguards are not active yet");
    expect(markup).toContain("not yet enforced by their workflows");
    expect(markup).toContain('aria-describedby="settings-accounting-partial-note"');
    expect(markup).toContain("Warn on duplicate document numbers");
    expect(markup).toContain('value="90"');
    expect(markup).toContain('disabled=""');
  });
});
