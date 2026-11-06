# List search keyboard recovery

The shared `DataTableToolbar` is used by the common record lists and the sales/purchases
list wrapper. Clearing its query previously removed the focused clear button without
returning focus to the search input. Keyboard users had to find the field again before
entering another search.

## Behavior

- Clicking or keyboard-activating Clear search returns focus to the same search input.
- Escape in a nonempty standalone list search clears only that query and keeps input focus.
- An enclosing dialog retains its existing Escape dismissal behavior. Events already consumed
  by the surrounding layer are left alone.
- Escape during text composition does not clear the query.
- Filtering, pagination resets owned by callers, export scope and permissions are unchanged.

The change adds one input ref and local event handling, without global listeners or new
dependencies. No server, accounting, authentication, permission or database logic changes.

## Verification and manual review

The existing CSV regression verifies filtered export scope, pointer clear, focus return and
immediate typing. New browser fixtures cover keyboard clear, Escape, repeated typing and focus recovery at 375, 768 and 1440px. A synthetic composing event covers the input guard; real
IME acceptance still requires an enabled input method on the user's browser/OS.

On a searchable sales or purchases list, type a customer/supplier name, clear it, then type
again without clicking the field. Verify the correct records return. Repeat with keyboard
Tab/Enter and Escape. Confirm existing status/date filters and view-only permissions remain
intact. Review desktop, tablet and mobile in both light and dark modes. Fixture checks do
not replace authenticated staging, screen-reader or production acceptance.
