# LinkBooks Signal

Signal is a persistent browser voice assistant for the company workspace. Enable
**Settings → Features → Voice commands**, then open the Signal control in the
header and choose **Start assistant**. It never activates the microphone on load.
**Ctrl+Shift+Space** starts/stops it; the visible square Stop control remains
available while the panel is minimised. Escape minimises the panel and leaves the
session active. Say “stop listening” to deactivate command recognition. If wake detection was explicitly armed, this returns to local wake detection; otherwise the microphone is released.

Signal uses the browser’s Web Speech API and predefined English rules. It uses no
LLM, generative AI, paid AI API or new API keys. It is a bounded command system,
not an unrestricted conversational model. Typed commands use the same dispatcher
without requiring microphone support.

## Custom wake phrases (Phase 15)

In **Settings → Automation → Personal wake phrase**, choose a phrase such as “Hey
LinkBooks”, “Hello LinkBooks” or “Hey Luna”, save it, then click **Enroll phrase**.
Repeat the same phrase three times in a quiet room, pausing between repetitions.
Enable the setting and click **Arm wake detection**. Enabling alone never starts
capture; each new page/session requires an explicit Arm click. The assistant panel
also exposes these settings. They are personal to your account, organisation and
browser; they are not organisation-wide voice recordings.

The separate on-device acoustic matcher listens for the enrolled sound, without
speech-to-text in standby. After detection, pause for Signal's listening animation
before speaking commands. The wake capture releases its microphone before browser
command recognition starts. Multiple commands work until you stop. **Stop all
microphones** stops both stages; the header square also stops wake detection while
inactive. Hidden pages pause detection. Delete wake profile removes local acoustic
templates. No raw audio is retained or uploaded by the wake stage.

This is a personal enrolled matcher: changes of voice/microphone/noise can cause
misses or similar-sounding false activations. It is not authentication. Manual
activation remains available. Chromium's real audio pipeline is tested with spoken
WAV input; physical-microphone/human accuracy and other browser/OS combinations
have not been certified. See [engine assessment and privacy details](voice-wake-engine-assessment.md).

## Guided bill entry and quick activation

Use the microphone button beside the Signal pill for one-click activation after browser permission is granted. Wake-phrase recognition still requires explicit enrollment and arming; browser security prevents silent microphone activation on page load. The assistant shows its current listening state and the last recognized phrase.

On the new bill editor, say “choose supplier” to open the supplier lookup, or “select supplier Northwind Supplies” to choose an exact, loaded supplier. A successful supplier selection advances focus to Bill date. “Next tab”, “next field” and “previous tab” move among the registered fields **inside the current document**, including Bill date, Payment terms and Due date. Say “choose payment terms Net 30” to select an available payment term and advance to Due date. Ambiguous suppliers or terms require an explicit choice; no unlisted supplier is invented. The selected field is outlined and scrolled into view. Browser applications cannot move the operating-system mouse pointer.

Outside a document editor, “next tab” and “previous tab” continue to navigate Sales/Purchases section tabs. No voice commands post, authorise or pay bills.

## Field-by-field entry

On an invoice, quote, sales credit note or new bill, say “go to description”, “go
to supplier” (or customer), “go to date”, “go to reference”, “next field” or
“previous field”. The selected control is focused and highlighted; record dropdowns
open normally. Say the field's value next. Text replaces the selected field and
preserves the recognised case and punctuation. Browser transcription itself may
alter punctuation. “Clear this field” clears text/numeric/date entry, subject to
normal form validation; record selections use their normal controls.

Use “dictate Open invoices” to enter literal text that sounds like a command.
Navigation, save and other recognised command phrases remain reserved controls.
With several line fields, specify “go to line 2 description” or choose a numbered
result. Select unit price separately from calculated line total. Record names
match loaded, eligible options and ambiguous names require a choice. No record is
invented. Intentional focus changes and line additions/removal/reordering invalidate
old field targets. Unsupported fields still use the usual keyboard and mouse UI.

Dates accept “15 October 2026”, “15th October 2026”, “October 15, 2026” and ISO.
Numeric dates such as “15/10/2026” use the company's configured `DD/MM/YYYY` or
`MM/DD/YYYY` order with a four-digit year. Invalid calendar dates are rejected.
Purchases tab labels, including purchase orders, recurring, employee expenses,
statements and settings, are shared with voice navigation. Shared names such as
credit notes use the current Sales/Purchases module; “open purchases credit notes”
is explicit from anywhere.

## Continuous workflow

1. “Create a new invoice” (or “create an invoice for ABC Limited”).
2. “Select customer ABC.” If several names match, choose a numbered result or say
   its full name. No customer is invented or silently selected from ambiguous names.
3. “Set invoice date to October 31, 2026.”
4. “Add consulting services for GBP 1500.”
5. “Use account Consulting income.”
6. “Set tax code to Standard VAT” (use a code available in the form).
7. “Set due date to November 15, 2026.”
8. “Change that to GBP 1800.” This targets the last edited line of this form.
9. “Save invoice.” Review the contact, dates, currency, accounts, quantity, prices,
   discounts and tax on screen, then click **Confirm save**. Saying “yes” does not
   save a document. Save confirmations expire after two minutes.
10. Continue with another command, then stop Signal explicitly.

The same structured editing interface is connected to the existing invoice,
quote, sales credit-note and new-bill editors, including their Create-new flyovers.
Recurring bill templates are excluded. Forms retain their existing validation,
notes/attachment handling and save handlers. The assistant never calls an
“authorise” variant of a save handler.

Additional commands include “add another item”, “remove the second line item”,
“set line 2 amount to 250”, “set quantity to 2”, “set discount to 15”, “set memo
to …”, “set invoice number to …”, “set currency to USD”, “use the previous
customer”, “go back”, and “show me the invoice again” for the last confirmed save.
“Cancel this invoice” cancels the pending voice action; it does not delete or
silently clear the form. Use the normal form controls to discard the document.

Navigation comes from the shared sidebar catalog, with specific invoice/bill
lists, customer/supplier lists, expenses, payments and reconciliation destinations.
Examples: “open dashboard”, “open invoices”, “open bills”, “open banking”, “open
contacts”, “open reports”, “open chart of accounts”, “open settings”. Every current
sidebar destination has an automated navigation check. The application’s separate
platform-admin/auth surfaces do not host a company voice session.

## Values, permissions and confirmation

- Dates accept full English month names with a year, ISO dates, today, tomorrow and
  next weekday. Relative dates use the form’s company-local reference day.
  Numeric dates use the company’s configured date order. Invalid or unconfigured numeric dates prompt for clarification.
- Amounts use exact decimal strings and the existing currency minor-unit helpers.
  Explicit currency must match the form. “$”/“dollars”, excessive decimal precision,
  negative/zero amounts and out-of-range values prompt for clearer input/manual review.
  Currency changes with existing amounts require manual review in the form.
- Accounts and tax codes come from the active editor’s eligible records. Newly
  dictated lines need an account; the user reviews the form’s tax treatment before
  saving. Tax-code selection uses that code’s real rate. No accounts/rates are invented.
- Current company permissions are checked before dispatch. Each editor registers
  its permission and state. Existing authenticated server functions and database RLS
  remain authoritative for all reads and writes.
- Draft saves use the existing domain handlers after a revision-bound on-screen
  confirmation and local validation. Editing the form, changing its identity or
  navigating away cancels the confirmation. Server validation still runs at save time.
- Voice-triggered posting, authorisation, sending, payments, refunds, record deletion
  and bulk execution are not exposed. Use the existing manual review, confirmation,
  approval and server-authorised controls for those operations.
- Submission locks, consumed revisions and recognition-turn generations prevent
  duplicate callbacks, overlapping commands and double confirmation. A failed or
  ambiguous save response is never retried automatically; that mounted form’s voice
  save is blocked until the user checks the document list and resolves it manually.
- A server-authenticated audit marker records confirmed voice draft saves with user,
  module, record, action identifier and result. It verifies permission, company and
  draft status; it stores no raw transcript/audio. Audit-marker failure is reported
  as a warning about an already saved draft and never triggers another save.

## Recognition and privacy

Browser speech recognition **may require internet access** and send audio to the
browser vendor. HTTPS/localhost and a supporting browser exposing
`SpeechRecognition` or `webkitSpeechRecognition` are required. English (`en-GB`)
is configured; browser, OS, accent and noise affect accuracy. Universal browser
support and offline recognition are not promised.

A recognition turn ends after a final result or 15 seconds. The activated session
reconnects without another user click. Transient failures use bounded backoff;
permission denial, unavailable microphones/language or repeated failures stop with
an explanation. Hiding the tab or going offline pauses recognition without losing
activation; returning/going online resumes it. Signing out, changing company/user,
changing permissions, disabling the feature or unmounting the workspace terminates
it. There is one recogniser at a time, and queued callbacks from old turns/scopes
are discarded.

Session context exists only in memory. The latest recognised phrase is displayed,
not logged or persisted. Scope changes clear pending commands, remembered contacts
and saved-record references. Form identity is checked before contextual edits; an
old form’s line/customer context cannot be applied to a different form implicitly.
No spoken response/TTS is enabled, so the assistant cannot hear its own responses.

## Integration boundaries and release checks

Navigation is integrated across the sidebar catalog. Structured form editing and
confirmed draft saving are integrated in the four editors listed above; contact
record editing, expenses, payments, journals, reconciliation actions, recurring
workflows and arbitrary report/table filters continue through their normal UI.
Future modules can register typed adapters through `useVoiceForm`; they are not
claimed integrated until a handler and tests exist.

The current form owns its unsaved field values, notes and files. The voice session
and its last confirmed record survive navigation, but leaving an unsaved editor
uses that editor’s normal discard/persistence behaviour. Signal does not restore
an entire unsaved editor after it unmounts or a page refresh, and does not apply an
old draft to a new form. Save a draft before leaving a workflow you need to resume.

Existing draft-create APIs do not accept a general durable idempotency key. The
assistant therefore fails closed after an uncertain response instead of claiming
exactly-once delivery or retrying a possible creation. Durable retries across
reloads/devices require a future transactional server idempotency facility.

Automated browser checks use the real editors and navigation with simulated speech
and fixture domain API responses. They verify state changes, payloads, confirmation,
recovery and navigation, not live Supabase writes or real microphone accuracy.
Before production rollout, use an authorised test account to verify actual speech,
permission prompts, server rejection/locked periods, audit activity, and a controlled
invoice/bill draft save on supported desktop/mobile browsers. No browser credentials
or microphone recording were available to automate those live checks here.

Run `npm run typecheck`, `npm test`, `npm run build`, and `npm run test:voice`.
The last command has a dedicated Chromium CI job. A system Chromium can be selected
with `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. Repository-wide lint has a documented
pre-existing backlog; lint the changed feature separately and compare source-wide
results against main. No dependency or database migration is added by Signal.

## Additional professional bill commands

- Scroll the workspace: `scroll up`, `scroll down`, `scroll left`, `scroll right`, `page down`, `page up`, `scroll to top`, `scroll to bottom`, or `scroll down a little`. Signal scrolls the nearest scrollable container around the focused element when possible, otherwise the page. It does not move the operating-system mouse cursor.
- Field selection: `go to supplier`, `choose supplier`, `go to bill date`, `go to payment terms`, `go to due date`, `go to supplier invoice number`, `go to memo`, `next tab`, `previous field`. When an editable bill is open, `next tab` means the next registered field; outside an editor, Sales/Purchases tab navigation remains available.
- Dictation: `enter text`, `input text`, `type value`, `dictate` prompts for the next utterance after a field is focused. `input text Monthly services` enters the supplied text immediately. For supplier, terms, account and tax lookups, text is matched to loaded options and ambiguity requires an explicit choice.
- Dates: `set bill date to April 14 2026`, `enter bill date April 14 2026`, `input due date as May 15 2026`, `April 14 twenty twenty six`, full month names, abbreviations and configured numeric formats. Calendar-invalid and ambiguous dates are rejected.
- Draft: `save draft` and `save bill` request a review; saving still requires pressing Confirm save on screen. Voice never authorises, posts or pays a bill.

Only registered, permitted document fields and supported navigation destinations are voice-controllable; Signal does not blindly click arbitrary visible controls.
