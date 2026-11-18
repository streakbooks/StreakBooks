/**
 * Journal posted but document status/link update failed.
 * Callers must tell the user to retry Authorise — never treat this as a plain draft-only failure.
 */
export class JournalPostedUnlinkedError extends Error {
  readonly journalId: string;
  readonly statusHint = "posted_unauthorised" as const;
  constructor(journalId: string, message: string) {
    super(message);
    this.name = "JournalPostedUnlinkedError";
    this.journalId = journalId;
  }
}

export function isJournalPostedUnlinkedMessage(message: string): boolean {
  return /journal was posted but/i.test(message);
}
