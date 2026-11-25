import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Check } from "lucide-react";
import { AdvisorChatPanel } from "@/components/advisors/AdvisorChatPanel";
import { AdvisorServiceIllustration } from "@/components/advisors/AdvisorServiceIllustration";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { Button } from "@/components/ui/button";
import {
  ADVISORS_EXCLUSIONS,
  ADVISORS_LANDING,
  formatAdvisorPlanPrice,
  getDefaultAdvisorService,
  isAdvisorServiceCode,
  type AdvisorServiceCode,
} from "@/lib/advisors/catalogue";
import { listPublicAdvisorServices } from "@/lib/advisors/public.functions";
import { rememberAdvisorServiceSelection } from "@/lib/advisors/selection";

export function AdvisorsServiceSelectedPage({ serviceCode }: { serviceCode: string }) {
  const load = useServerFn(listPublicAdvisorServices);
  const catalogue = useQuery({
    queryKey: ["public-advisor-services"],
    queryFn: () => load(),
    retry: false,
  });

  const valid = isAdvisorServiceCode(serviceCode);
  const code = (valid ? serviceCode : "bookkeeping") as AdvisorServiceCode;
  const service =
    catalogue.data?.services.find((item) => item.code === code) ??
    (catalogue.isError ? null : getDefaultAdvisorService(code));

  useEffect(() => {
    if (valid) rememberAdvisorServiceSelection(code);
  }, [valid, code]);

  if (!valid) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="text-2xl font-semibold">Service not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Choose one of the two StreakBooks Advisors services to continue.
        </p>
        <Button asChild className="mt-6">
          <Link to="/advisors">Back to Advisors</Link>
        </Button>
      </main>
    );
  }

  if (catalogue.isError || !service) {
    return (
      <main className="mx-auto max-w-3xl space-y-4 px-4 py-16">
        <h1 className="text-2xl font-semibold">Could not load this service</h1>
        <QueryErrorState queries={[catalogue]} title="Could not load advisor services" />
        <Button asChild variant="outline">
          <Link to="/advisors">Back to Advisors</Link>
        </Button>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-background">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,oklch(0.7_0.07_200_/_0.2),transparent_40%),linear-gradient(180deg,oklch(0.97_0.01_250),transparent_45%)] dark:bg-[radial-gradient(circle_at_top_right,oklch(0.32_0.05_200_/_0.35),transparent_42%),linear-gradient(180deg,oklch(0.2_0.03_250),transparent_48%)]"
      />
      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-10 sm:px-6 lg:py-14">
        <div className="flex flex-wrap items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link to="/advisors">
              <ArrowLeft className="size-4" aria-hidden="true" />
              All services
            </Link>
          </Button>
          <p className="text-sm font-semibold tracking-[0.16em] text-primary uppercase">
            {ADVISORS_LANDING.brandTitle}
          </p>
        </div>

        <section className="grid items-start gap-8 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-5">
            <p className="text-sm font-medium text-info">{service.startingLabel}</p>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              {service.headline}
            </h1>
            <p className="max-w-2xl text-base leading-relaxed text-muted-foreground">
              {service.description}
            </p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {service.benefits.map((benefit) => (
                <li key={benefit.key} className="flex gap-2 text-sm text-foreground">
                  <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
                  <span>{benefit.label}</span>
                </li>
              ))}
            </ul>
            <p className="text-sm text-muted-foreground">
              You can review plans now without answering chatbot questions. The Advisors AI chat is
              available on this page only after you chose this service — it does not open on the
              landing page.
            </p>
            <Button asChild size="lg">
              <Link to="/advisors/book" search={{ service: code }}>
                Book free consultation
              </Link>
            </Button>
          </div>
          <AdvisorServiceIllustration
            illustrationKey={service.illustrationKey}
            title={`${service.headline} illustration`}
          />
        </section>

        <section id="plans" aria-labelledby="plans-heading" className="space-y-5">
          <div className="space-y-2">
            <h2 id="plans-heading" className="text-2xl font-semibold tracking-tight">
              Plans and pricing
            </h2>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Prices are shown in {service.currency}. Choose a plan to review your details and
              continue to secure Razorpay checkout. Advisors billing is separate from your
              StreakBooks software subscription.
            </p>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {service.plans.map((plan) => (
              <article
                key={plan.code}
                className="flex h-full flex-col gap-4 rounded-2xl border border-border/70 bg-card/80 p-5 shadow-card"
              >
                <div className="space-y-1">
                  <h3 className="text-lg font-semibold">{plan.name}</h3>
                  <p className="text-sm text-muted-foreground">{plan.audience}</p>
                  <p className="text-xl font-semibold text-foreground">
                    {formatAdvisorPlanPrice(plan)}
                  </p>
                  <p className="text-sm text-muted-foreground">{plan.summary}</p>
                </div>
                <ul className="space-y-2">
                  {plan.inclusions.map((item) => (
                    <li key={item} className="flex gap-2 text-sm text-foreground">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <Button asChild className="mt-auto w-full">
                  <Link to="/advisors/checkout" search={{ service: code, plan: plan.code }}>
                    {plan.cadence === "month" ? "Subscribe monthly" : "Buy this session"}
                  </Link>
                </Button>
              </article>
            ))}
          </div>
        </section>

        <section aria-labelledby="exclusions-heading" className="space-y-3">
          <h2 id="exclusions-heading" className="text-lg font-semibold">
            Not included unless separately contracted
          </h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {ADVISORS_EXCLUSIONS.map((item) => (
              <li key={item} className="text-sm text-muted-foreground">
                {item}
              </li>
            ))}
          </ul>
        </section>
      </div>
      <AdvisorChatPanel serviceCode={code} enabled />
    </main>
  );
}
