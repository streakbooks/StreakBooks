import { lazy, Suspense, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { DeveloperSubnav } from "@/components/app-store/DeveloperSubnav";
import { EmptyState, LoadingState, PageHeader } from "@/components/common/states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useCan } from "@/hooks/use-can";
import { developerPortalSection, type DeveloperPortalSectionKey } from "@/lib/app-store/sections";
import type { Permission } from "@/lib/permissions";

const DeveloperApiDocsPage = lazy(() =>
  import("@/screens/developer/api-docs").then((m) => ({ default: m.DeveloperApiDocsPage })),
);
const DeveloperSubmissionPage = lazy(() =>
  import("@/screens/developer/submission").then((m) => ({ default: m.DeveloperSubmissionPage })),
);

function SectionSuspense({ children }: { children: ReactNode }) {
  return <Suspense fallback={<LoadingState />}>{children}</Suspense>;
}

export function DeveloperSectionPage({ sectionKey }: { sectionKey: DeveloperPortalSectionKey }) {
  const { can } = useCan();
  const section = developerPortalSection(sectionKey);

  if (sectionKey === "api-docs") {
    return (
      <SectionSuspense>
        <DeveloperApiDocsPage />
      </SectionSuspense>
    );
  }
  if (sectionKey === "submission") {
    return (
      <SectionSuspense>
        <DeveloperSubmissionPage />
      </SectionSuspense>
    );
  }

  const allowed = section.anyOf.some((permission) => can(permission as Permission));
  if (!allowed) {
    return (
      <>
        <PageHeader title={section.label} description="Developer portal" />
        <DeveloperSubnav current={sectionKey} />
        <EmptyState
          title="No access"
          description="Your role cannot open this developer workspace."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={section.label}
        description="LinkBooks open integration platform."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/developer">Back to dashboard</Link>
          </Button>
        }
      />
      <DeveloperSubnav current={sectionKey} />
      <Alert className="mb-6">
        <AlertTitle>
          {section.label} continues in {section.batch}
        </AlertTitle>
        <AlertDescription>
          Database foundations for publishers, applications and hash-only OAuth clients are in
          place. Interactive credential issuance and submission workflows are delivered in{" "}
          {section.batch}. No fake approval or live partner connection is simulated here.
        </AlertDescription>
      </Alert>
      <EmptyState
        title={`${section.label} workspace ready`}
        description="Use API Documentation now. Remaining developer tools unlock with verified partner onboarding."
        action={
          <Button asChild>
            <Link to="/developer/$section" params={{ section: "api-docs" }}>
              Open API documentation
            </Link>
          </Button>
        }
      />
    </>
  );
}
