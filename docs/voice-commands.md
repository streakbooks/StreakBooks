# Browser voice commands

An administrator can enable **Voice commands** in **Settings → Features** for an
organisation. It is off by default. The microphone button then appears in the
application header for members with `company.view`. No AI provider, API key,
generative model, or paid AI API is used by this feature.

Click the microphone button, read the browser speech disclosure, then click
**Start listening**. Allow microphone access when the browser asks. Say one
English command. **Stop**, closing the dialog (including Escape), changing page,
company or permissions, disabling the feature, or hiding the tab cancels the
session and discards pending speech results. Listening ends after the first final
result, including an unknown or denied command, or after 15 seconds. It never
restarts automatically. Normal keyboard and mouse controls remain available.

| Command           | Existing destination   | Required permission, in addition to `company.view` |
| ----------------- | ---------------------- | -------------------------------------------------- |
| open dashboard    | `/`                    | none                                               |
| open invoices     | `/sales/invoices`      | `sales.view`                                       |
| open bills        | `/purchases/bills`     | `purchases.view`                                   |
| open banking      | `/banking`             | `banking.view`                                     |
| open contacts     | `/contacts`            | none (the directory uses membership access)        |
| create invoice    | `/sales/invoices/new`  | `sales.view`, `sales.draft`                        |
| create bill       | `/purchases/bills/new` | `purchases.view`, `purchases.draft`                |
| open sales        | `/sales`               | `sales.view`                                       |
| open purchases    | `/purchases`           | `purchases.view`                                   |
| open reports      | `/reports`             | `reports.view`                                     |
| open fixed assets | `/fixed-assets`        | `accounting.view`                                  |

Navigation also accepts “show”, “go to”, “navigate to”, “take me to”, “view”,
“display”, and “switch to”. “New invoice” and “open new invoice” open the same
blank invoice form. Matching ignores case, whitespace, sentence punctuation and
Unicode width, but requires a complete predefined phrase. Additional clauses,
arbitrary URLs, dictating invoice contents, and financial actions are rejected.
Creation commands open the existing form only; the user must fill it in and use
its usual save/authorise controls. Voice code has no financial mutation handlers.

## Browser and permission limitations

- Requires HTTPS or localhost and a browser exposing `SpeechRecognition` or
  `webkitSpeechRecognition`. Support varies by browser, OS, settings and language.
  Unsupported browsers display an explanation and keep normal controls usable.
- Recognition is configured for English (`en-GB`). Accents, noise and the browser
  service can affect accuracy. There is no fuzzy matching or conversational mode.
- **Browser speech recognition may require internet access** and may send audio
  to the browser vendor's speech service. This is not an offline guarantee. The
  app does not record audio or persist transcripts; the last recognised phrase is
  kept only in component memory and cleared when its context unmounts.
- Permission denial includes site-setting recovery instructions. Missing
  microphones, network errors, no speech, unsupported language and timeouts have
  separate messages. Each retry requires another click.
- UI checks use the same server-resolved company permissions (and existing role
  fallback) as `useCan`. Existing authenticated routes, server functions and RLS
  still enforce access to the destination's data. There is no new authorization
  endpoint or requirement for `ai.use`. Feature lookup errors hide the control.

## Earlier work reused

Repository-wide branch, commit, PR and source searches found earlier work in
`feature/documents-folder-upload-fix` (the branch of draft PR #5, whose title is
about Files). Relevant commits include `ed44d57` (navigation), `6cc0612`
(deterministic allowlist), `5b797f8` (browser recognition replacing paid Realtime),
and `481e560` (stale company and duplicate-final guards). These files are absent
from `main`.

This implementation adapts the same `ai-voice` component/module locations,
normalisation, navigation prefixes, aliases and cancellation pattern. It points
invoice/bill commands at the specific list routes, adds blank-form destinations,
and uses each module's permissions. It does not import the branch's Realtime
credential code, server reviews, multi-turn draft previews or mutation proposals.
The existing organisation feature catalog now reports browser voice commands as
available and needs no provider configuration.

## Verification

- `npm run typecheck`, `npm test`, `npm run build`, and `npm run lint` are the
  repository checks. CI's existing verification job runs typecheck, tests and build.
- `npm run test:voice` runs a separate Playwright suite using the production
  `VoiceAssistant` and `VoiceControl`, real React Query and TanStack navigation,
  deterministic browser speech events, and fixture company/feature responses.
  It needs no account, API keys, external speech service or financial data. CI
  installs Chromium and runs this suite. For a local system Chromium, set
  `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its executable path.
- Unit coverage includes matching, compound/mutating command rejection, module
  permissions, microphone cleanup, queued and duplicate final results, browser
  errors, no speech, timeout and synchronous permission rejection. Browser coverage
  includes the requested routes, explicit start, Stop/Escape, unsupported browsers,
  retry, permission/feature/company changes and ordinary keyboard/mouse navigation.
- The browser fixture verifies route selection, not authenticated destination data
  loading or actual recognition accuracy. Before release, manually check microphone
  permission, spoken English commands and recognition connectivity on supported
  desktop/mobile browsers with an authorised account. Do not save financial records
  during these navigation checks.
