import { createFileRoute, redirect } from "@tanstack/react-router";

type EditSearch = { files?: boolean };

/**
 * Legacy /edit URL — drafts are now edited inline on the bill document page.
 * Keep this route so bookmarks and older links still work.
 */
export const Route = createFileRoute("/_authenticated/purchases/bills/$billId/edit")({
  validateSearch: (s: Record<string, unknown>): EditSearch => {
    const out: EditSearch = {};
    if (s["files"] === true || s["files"] === "1" || s["files"] === "true") out.files = true;
    return out;
  },
  beforeLoad: ({ params, search }) => {
    throw redirect({
      to: "/purchases/bills/$billId",
      params: { billId: params.billId },
      search,
      replace: true,
    });
  },
});
