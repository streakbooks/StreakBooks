import { createFileRoute, Link, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/advisors-admin")({
  head: () => ({
    meta: [
      { title: "Advisors — StreakBooks" },
      {
        name: "description",
        content: "StreakBooks Advisors administration for services, pricing and delivery.",
      },
    ],
  }),
  component: AdvisorsLayout,
});

function AdvisorsLayout() {
  return (
    <div className="min-h-screen">
      <div className="border-b bg-muted/20">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-3">
          <div>
            <p className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">
              StreakBooks Advisors
            </p>
            <p className="text-sm text-muted-foreground">
              Administration for the Advisors service lifecycle
            </p>
          </div>
          <Link to="/advisors" className="text-sm text-primary underline">
            View public page
          </Link>
        </div>
      </div>
      <Outlet />
    </div>
  );
}
