# Signal architecture and audit

## Root cause of the former one-command lifecycle

The navigation-only implementation merged in PR #37 intentionally:

- keyed `VoiceControl` by `[company.id, permissions, location]`, remounting the
  component and clearing state on every route change;
- aborted recognition in `startSpeechCommand` before delivering the first final
  result, with no session-level restart controller;
- used a 15-second one-shot timer, and stopped on hidden/pagehide events;
- owned activation/transcript/status in the modal component, alongside its dismissal.

It was not a missing route or a browser promise of continuous speech. Those policies
implemented the previous navigation-only scope. The new directive requires a
persistent activation lifetime independent of the browser’s individual turns.

## Architecture

`AppShell` wraps its existing layout in `VoiceProvider`. That provider owns one
`AssistantController`, subscribes to current user/company/permissions/feature
settings, and forwards visibility, connectivity, permission and keyboard events.
It survives ordinary child routes. Company-scoped main content remounts when its
user/company identity changes, so editor state cannot carry across organisations.

`AssistantController` exposes an immutable snapshot through `useSyncExternalStore`.
Its explicit states are inactive, initializing, listening, speech detected,
transcribing, understanding, executing, awaiting clarification, awaiting
confirmation, recovering and error. Activation is retained across successful
commands and recognition endings. Only explicit Stop, identity/security changes,
feature loss, teardown or a terminal recognition failure deactivate it.

`browser-recognition.ts` remains the single-turn browser adapter. It detaches
handlers and aborts on completion/cancellation. Session generations and turn
identifiers discard late events; the controller schedules a fresh turn after
processing finishes. Transient failures back off rather than creating simultaneous
sessions. Hidden/offline workspaces suspend and later resume the activated session.

`actions.ts` defines a validated action schema, risk/confirmation policy and strict
English parsing for form actions, calendar dates, exact money and entity matching.
Navigation continues through the existing deterministic engine, now joined to the
shared navigation catalog. No model or arbitrary URL/SQL/code execution is involved.

Mounted document editors register a typed `VoiceFormAdapter` through `useVoiceForm`.
It exposes ready/busy state, current draft, real eligible contacts/accounts/taxes,
currency choices, controlled React setters, validation and its existing save
mutation. Registration does not select DOM elements or simulate clicks. Newest
mounted forms take precedence over background forms; each pending edit or save is
bound to the active form token, revision and company.

The dispatcher only saves a draft after its confirmation is accepted through the
visible UI. The existing server save function performs authentication, permission
checks, financial validation and domain persistence. A subsequent authenticated
`recordVoiceDraftOutcome` verifies that the record belongs to the company and is a
draft before recording provenance through the existing audit RPC. No audit schema,
service-role credential or new database permission is introduced.

## Original visual decisions

Signal’s identity uses three offset light fins with asymmetric heights and slanted
contours, drawn entirely in CSS. Indigo/cyan light and a restrained amber accent
communicate activity and review. Motion changes amplitude/opacity rather than
mimicking a proprietary orb, island, logo or animation. There are no imported
reference-image assets. Existing licensed Lucide icons and StreakBooks design tokens
provide the normal controls. Reduced-motion preferences disable animation.

The compact control lives in the existing header; its optional details panel is
non-modal, has no dimming backdrop/focus trap and can be minimised without ending
the session. On mobile it stays within the viewport. Stop is visible even when the
panel is minimised. Native buttons, a keyboard shortcut and live announcements
preserve keyboard, mouse and screen-reader use. Expanded details can overlap page
content; users can minimise them while retaining listening, rather than being
forced through an obstructive modal.

This records independent implementation/design choices, not a legal clearance.

## Verified scope and remaining production work

See [voice-commands.md](./voice-commands.md) for commands, module boundaries,
privacy, retry limitations and the authorised-account release checklist.
The new assistant is deliberately honest about capabilities: navigation across the
catalog and four document-editor integrations are tested; other financial modules
retain their existing manual workflows. Durable server idempotency, full unsaved
editor restoration across route unmounts, unrestricted conversation and live
microphone/server verification remain outside the implemented guarantees.
