import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check } from "lucide-react";
import { AdvisorServiceIllustration } from "@/components/advisors/AdvisorServiceIllustration";
import { Button } from "@/components/ui/button";
import { ADVISORS_LANDING, type AdvisorService } from "@/lib/advisors/catalogue";
import { listPublicAdvisorServices } from "@/lib/advisors/public.functions";
import { rememberAdvisorServiceSelection } from "@/lib/advisors/selection";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { cn } from "@/lib/utils";

function ServiceCard({ service }: { service: AdvisorService }) {
  return (
    <article
      className={cn(
        "flex h-full flex-col overflow-hidden rounded-3xl border border-border/70 bg-card/80",
        "shadow-card backdrop-blur-sm",
      )}
    >
      <AdvisorServiceIllustration
        illustrationKey={service.illustrationKey}
        title={`${service.headline} illustration`}
        className="rounded-none"
      />
      <div className="flex flex-1 flex-col gap-5 p-6 sm:p-8">
        <div className="space-y-3">
          <p className="text-sm font-medium text-info">{service.startingLabel}</p>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">
            {service.headline}
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">{service.description}</p>
        </div>
        <ul className="space-y-2.5">
          {service.benefits.map((benefit) => (
            <li key={benefit.key} className="flex gap-2 text-sm text-foreground">
              <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
              <span>{benefit.label}</span>
            </li>
          ))}
        </ul>
        <div className="mt-auto pt-2">
          <Button asChild className="w-full sm:w-auto" size="lg">
            <Link
              to="/advisors/$serviceCode"
              params={{ serviceCode: service.code }}
              onClick={() => rememberAdvisorServiceSelection(service.code)}
            >
              {service.ctaLabel}
            </Link>
          </Button>
        </div>
      </div>
    </article>
  );
}

export function AdvisorsLandingPage() {
  const load = useServerFn(listPublicAdvisorServices);
  const catalogue = useQuery({
    queryKey: ["public-advisor-services"],
    queryFn: () => load(),
    retry: false,
  });
  const services = catalogue.data?.services ?? [];

  return (
    <main className="relative min-h-screen overflow-hidden bg-background">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,oklch(0.72_0.08_210_/_0.22),transparent_42%),radial-gradient(circle_at_80%_20%,oklch(0.55_0.08_250_/_0.18),transparent_36%),linear-gradient(180deg,oklch(0.97_0.01_250),transparent_48%)] dark:bg-[radial-gradient(circle_at_top_left,oklch(0.35_0.06_210_/_0.35),transparent_42%),radial-gradient(circle_at_80%_10%,oklch(0.28_0.05_250_/_0.35),transparent_40%),linear-gradient(180deg,oklch(0.2_0.03_250),transparent_50%)]"
      />
      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 py-12 sm:px-6 lg:py-16">
        <header className="max-w-3xl space-y-5">
          <p className="text-sm font-semibold tracking-[0.18em] text-primary uppercase">
            {ADVISORS_LANDING.brandTitle}
          </p>
          <h1 className="text-4xl font-semibold tracking-tight text-balance text-foreground sm:text-5xl">
            {ADVISORS_LANDING.heading}
          </h1>
          <p className="max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            {ADVISORS_LANDING.supporting}
          </p>
        </header>

        {catalogue.isLoading ? (
          <p className="text-sm text-muted-foreground" role="status">
            Loading services…
          </p>
        ) : null}
        {catalogue.isError ? (
          <QueryErrorState queries={[catalogue]} title="Could not load advisor services" />
        ) : null}

        <section
          aria-label="Advisor service choices"
          className="grid gap-6 lg:grid-cols-2 lg:gap-8"
        >
          {services.slice(0, 2).map((service) => (
            <ServiceCard key={service.code} service={service} />
          ))}
        </section>

        <p className="max-w-2xl text-sm text-muted-foreground">
          Choose a service to view plans and book a free consultation. No chatbot opens until you
          select a service, and answering qualification questions is optional.
        </p>
      </div>
    </main>
  );
}
