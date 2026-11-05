# Create-panel route context and safe prefills

## Trigger and behavior

Opening **Create → Purchase order**, **Supplier credit** or **Transfer money** from an unrelated
page previously mounted a screen that called a strict hook for its own route. The route was
not active, so the flyover failed with "Could not find an active match". An isolated browser
probe reproduced this for all three screens before the fix.

Reusable screens now accept optional explicit initial props and do not call route hooks.
Small private route adapters read the validated URL context and pass it to the screens.
Create-menu panels get blank defaults, so an unrelated page's `edit`, `billId`, bank or amount
search values cannot leak into a new document. Existing native order-edit, bill-credit and
statement-transfer links retain their intended context.

The adapters also reject numeric/JSON values retained by router parent search state. A transfer
amount must remain a string: an ambiguous numeric value is ignored rather than coerced through
floating-point arithmetic. Typed internal navigation encodes the original string and retains
its exact amount. This prevents a `value.trim` exception on malformed links.

## Boundaries

Queries, mutation payloads, currency parsing, financial calculations, posting rules, tenant
scopes, server authorization and RLS are unchanged. This fixes presentation/context handling;
server permission checks remain authoritative. No migrations or provider configuration change.

## Regression evidence

The dedicated create-panel fixture mounts the real Create menu, the real reusable screens,
and actual native file-route adapters under an unrelated dashboard. It uses deterministic
in-memory domain responses and blocks/records financial writes. Tests assert no external
HTTP requests and no write attempts. It does not connect to a live account or database.

Coverage includes all three menu actions from a page containing unrelated search values,
native document/statement prefills, malformed numeric values, view-only permission overrides,
and mobile draft preservation while resizing. Fixture tests stay excluded from the default
authenticated suite and run with their own isolated dependency cache.

## Manual acceptance

In a dedicated test organisation, open each action from Dashboard, Sales and Banking. Confirm
that a new flyover starts blank, accepts normal input, and keeps draft values during resizing.
Visit an existing draft order edit link, a supplier bill's credit link and a statement transfer
link; verify that each prefill is preserved. Check malformed links and view-only roles. Use
both keyboard and pointer on desktop, tablet and mobile. Perform real financial mutations only
as part of authorized staging acceptance, checking ledger results and permissions there.

Authenticated staging and production verification remain pending access; fixture results do
not establish real provider callbacks or live permission enforcement. No deployment or live
migration is part of this change. Final test counts and CI/merge links are recorded on the PR.
