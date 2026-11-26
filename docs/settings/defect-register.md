# Settings overhaul defect and review register

**Updated:** 2026-11-26  
**Status:** open; this is not an independent external audit.

| ID     | Severity | Finding                                                                                                                | Status / evidence                                                                                                                            |
| ------ | -------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| SET-01 | High     | Many typed configuration fields persist but lack a field-specific consumer effect and integration test.                | Open. Listed in `SETTING_FIELD_COVERAGE` as partial; editors are disabled until proof exists.                                                |
| SET-02 | High     | Company identity and locale update flow lacks explicit atomic before/after settings audit evidence.                    | Open in `SETTINGS_GAPS`; do not promote the setting to complete.                                                                             |
| SET-03 | High     | Security preferences such as owner MFA and session idle timeout are not proven to be enforced end-to-end.              | Open; controls remain partial/read-only.                                                                                                     |
| SET-04 | Medium   | Settings and profile preferences are split across two surfaces.                                                        | Partially addressed with a Personal preferences handoff; a unified user-scoped editor remains open.                                          |
| SET-05 | Medium   | Category and detail routes are implemented, but authenticated browser coverage could not run without test credentials. | Open; three Playwright cases are present and skipped when credentials are absent.                                                            |
| SET-06 | Medium   | The local browser's `/settings` screen showed an application error during review.                                      | Open; must be retested in a healthy authenticated dev session before release.                                                                |
| SET-07 | Medium   | Full repository lint reports broad formatting failures.                                                                | Open. Changed-file ESLint passes; full lint has not passed and its baseline was not re-run independently.                                    |
| SET-08 | Medium   | Hosted database migration history/backup evidence does not match the configured project.                               | No migration was required or applied for this route/UI work. Do not sync hosted migrations without target-specific verified backup evidence. |

## Independent review

The author performed a self-review of route ownership, redirects, query parsing, return URL validation, search indexing, settings field availability, generated route registration, module coverage and touched-file lint. No separate reviewer was available in this execution. Treat the unresolved items above as release gates where applicable.
