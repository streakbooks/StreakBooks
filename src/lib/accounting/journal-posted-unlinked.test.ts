import { describe, expect, it } from "vitest";
import {
  JournalPostedUnlinkedError,
  isJournalPostedUnlinkedMessage,
} from "@/lib/accounting/journal-posted-unlinked";

describe("JournalPostedUnlinkedError", () => {
  it("carries journal id and status hint", () => {
    const err = new JournalPostedUnlinkedError("jid-1", "The journal was posted but status failed");
    expect(err.journalId).toBe("jid-1");
    expect(err.statusHint).toBe("posted_unauthorised");
    expect(err).toBeInstanceOf(Error);
    expect(isJournalPostedUnlinkedMessage(err.message)).toBe(true);
  });

  it("detects honest retry wording", () => {
    expect(
      isJournalPostedUnlinkedMessage(
        "The journal was posted but the bill could not be marked authorised",
      ),
    ).toBe(true);
    expect(isJournalPostedUnlinkedMessage("Saved as a draft, but authorise failed")).toBe(false);
  });
});
