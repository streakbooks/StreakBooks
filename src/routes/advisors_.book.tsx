import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { AdvisorsBookingPage } from "@/screens/advisors/booking";

const searchSchema = z.object({
  service: z.enum(["bookkeeping", "coaching"]).optional(),
  plan: z.string().optional(),
});

export const Route = createFileRoute("/advisors_/book")({
  validateSearch: (search) => searchSchema.parse(search),
  head: () => ({
    meta: [
      { title: "Book a consultation — StreakBooks Advisors" },
      {
        name: "description",
        content: "Book a free StreakBooks Advisors consultation using real available time slots.",
      },
    ],
  }),
  component: AdvisorsBookRoute,
});

function AdvisorsBookRoute() {
  const search = Route.useSearch();
  return (
    <AdvisorsBookingPage
      {...(search.service ? { serviceCode: search.service } : {})}
      {...(search.plan ? { planCode: search.plan } : {})}
    />
  );
}
