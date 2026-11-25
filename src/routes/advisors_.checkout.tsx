import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { AdvisorsCheckoutPage } from "@/screens/advisors/checkout";

const searchSchema = z.object({
  service: z.enum(["bookkeeping", "coaching"]).optional(),
  plan: z.string().optional(),
});

export const Route = createFileRoute("/advisors_/checkout")({
  validateSearch: (search) => searchSchema.parse(search),
  head: () => ({
    meta: [
      { title: "Checkout — StreakBooks Advisors" },
      {
        name: "description",
        content: "Purchase a StreakBooks Advisors service through secure Razorpay checkout.",
      },
    ],
  }),
  component: AdvisorsCheckoutRoute,
});

function AdvisorsCheckoutRoute() {
  const search = Route.useSearch();
  return <AdvisorsCheckoutPage serviceCode={search.service ?? ""} planCode={search.plan ?? ""} />;
}

