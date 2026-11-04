# Accessible validation and component boundaries

This follow-up extends the shared interface changes merged in PR #52.

## User-visible behavior

- Record lookups preserve trigger labels, helper/error descriptions, invalid state and
  disabled state. An option's own metadata cannot overwrite the selected control's ID or
  validation. Explicit root values take precedence over declarative trigger values.
- Money inputs have stable unique IDs and link each invalid amount to its own announced
  error. Correcting the amount removes the error association. Parsing and precision are unchanged.
- Settings search has an accessible dialog name and description. Escape returns focus to
  its opener. Results are single interactive elements, retaining native URLs, modifier-click
  and one normal navigation. Keyboard selection retains the caller's embedded-settings callback.
- Checkout validation messages are announced. Provider effects depend on primitive flags,
  avoiding an unstable object dependency. The existing provider eligibility and payment calls
  are unchanged; invalid billing entries cannot initiate checkout.

## Shared component structure

Reusable variant definitions, list helpers, debounce/search hooks, line form-state factories,
form/sidebar contexts and the CAPTCHA hook live in dedicated modules. Repository imports use
these directly rather than coupling utilities to component modules. Component files retain
Fast Refresh boundaries. The CAPTCHA widget lifecycle and single-use token reset are preserved.
No lint rule or permission check is relaxed. CI runs full-repository ESLint with zero warnings.

No accounting calculations, postings, Supabase RPCs, RLS, credentials, migrations or provider
configuration are changed. No live migration or deployment is part of this follow-up.

## Regression coverage

The browser fixture uses real production components with deterministic in-memory dependencies.
It never posts financial records or creates payment sessions. A mocked CAPTCHA widget confirms
single-use reset without external requests. Keyboard, Escape/focus return, native new tabs,
normal navigation, validation recovery and checkout provider refreshes have regression tests.

Pinned `@axe-core/playwright` scans WCAG A/AA tags on the settings dialog and financial entry
controls across all nine palettes in light/dark mode, including a custom white accent. This
is automated coverage of representative surfaces, not screen-reader certification or a claim
that every route has been tested against live data. Existing voice and wake-word browser suites
are included in CI along with the financial interface regression suites.

## Manual review

- Banking → Transfers/Reconcile/Bank rules: enter malformed amounts, hear the matching error,
  then correct it. Verify that currency parsing and submission behavior remain intact.
- A customer/account record selector with validation: verify its label, helper, error, search,
  selection, disabled entries and view-only restrictions using keyboard and a screen reader.
- Settings → Search: type a category, use arrows/Enter, Escape, normal click and Ctrl/Cmd-click.
  Verify the correct destination, one navigation, native new tabs and focus return.
- Billing → Checkout in dedicated staging: change provider availability and validate empty
  fields. Preserve drafts and never initiate a real charge during acceptance testing.
- Auth in staging with CAPTCHA enabled: verify, submit, retry and confirm tokens reset.
- Review desktop, tablet, mobile, all palettes and light/dark/system preferences.

## Remaining live gates

Dedicated staging URL and test-account credentials are still required. Full authenticated
journeys, role/RLS checks, manual assistive-technology review, provider callbacks, production
performance and deployment verification remain separate acceptance gates. Static inventories
and fixture tests do not complete these live checks. Existing build deprecation warnings are
outside this UI follow-up. Actual test counts and merge/CI links are reported on its PR.
