import { lazy, Suspense, type ReactNode } from "react";
import { EmptyState, LoadingState, PageHeader } from "@/components/common/states";
import { DeveloperSubnav } from "@/components/app-store/DeveloperSubnav";
import { useCan } from "@/hooks/use-can";
import { developerPortalSection, type DeveloperPortalSectionKey } from "@/lib/app-store/sections";
import type { Permission } from "@/lib/permissions";

const DeveloperApiDocsPage = lazy(() =>
  import("@/screens/developer/api-docs").then((m) => ({ default: m.DeveloperApiDocsPage })),
);
const DeveloperSubmissionPage = lazy(() =>
  import("@/screens/developer/submission").then((m) => ({ default: m.DeveloperSubmissionPage })),
);
const DeveloperCredentialsPage = lazy(() =>
  import("@/screens/developer/credentials").then((m) => ({ default: m.DeveloperCredentialsPage })),
);
const DeveloperOAuthPage = lazy(() =>
  import("@/screens/developer/oauth").then((m) => ({ default: m.DeveloperOAuthPage })),
);
const DeveloperPublisherPage = lazy(() =>
  import("@/screens/developer/publisher").then((m) => ({ default: m.DeveloperPublisherPage })),
);
const DeveloperApplicationsPage = lazy(() =>
  import("@/screens/developer/applications").then((m) => ({
    default: m.DeveloperApplicationsPage,
  })),
);
const DeveloperRegisterAppPage = lazy(() =>
  import("@/screens/developer/register-app").then((m) => ({
    default: m.DeveloperRegisterAppPage,
  })),
);
const DeveloperWebhooksPage = lazy(() =>
  import("@/screens/developer/webhooks").then((m) => ({ default: m.DeveloperWebhooksPage })),
);
const DeveloperSandboxPage = lazy(() =>
  import("@/screens/developer/sandbox").then((m) => ({ default: m.DeveloperSandboxPage })),
);
const DeveloperVersionsPage = lazy(() =>
  import("@/screens/developer/versions").then((m) => ({ default: m.DeveloperVersionsPage })),
);
const DeveloperAnalyticsPage = lazy(() =>
  import("@/screens/developer/analytics").then((m) => ({ default: m.DeveloperAnalyticsPage })),
);
const DeveloperUsagePage = lazy(() =>
  import("@/screens/developer/usage").then((m) => ({ default: m.DeveloperUsagePage })),
);
const DeveloperPartnerPage = lazy(() =>
  import("@/screens/developer/partner").then((m) => ({ default: m.DeveloperPartnerPage })),
);
const DeveloperSupportPage = lazy(() =>
  import("@/screens/developer/support").then((m) => ({ default: m.DeveloperSupportPage })),
);

function SectionSuspense({ children }: { children: ReactNode }) {
  return <Suspense fallback={<LoadingState />}>{children}</Suspense>;
}

const LAZY_PAGES: Partial<
  Record<DeveloperPortalSectionKey, () => ReactNode>
> = {
  "api-docs": () => <DeveloperApiDocsPage />,
  submission: () => <DeveloperSubmissionPage />,
  credentials: () => <DeveloperCredentialsPage />,
  oauth: () => <DeveloperOAuthPage />,
  publisher: () => <DeveloperPublisherPage />,
  applications: () => <DeveloperApplicationsPage />,
  register: () => <DeveloperRegisterAppPage />,
  webhooks: () => <DeveloperWebhooksPage />,
  sandbox: () => <DeveloperSandboxPage />,
  versions: () => <DeveloperVersionsPage />,
  analytics: () => <DeveloperAnalyticsPage />,
  usage: () => <DeveloperUsagePage />,
  partner: () => <DeveloperPartnerPage />,
  support: () => <DeveloperSupportPage />,
};

export function DeveloperSectionPage({ sectionKey }: { sectionKey: DeveloperPortalSectionKey }) {
  const { can } = useCan();
  const section = developerPortalSection(sectionKey);
  const page = LAZY_PAGES[sectionKey];

  if (page) {
    return <SectionSuspense>{page()}</SectionSuspense>;
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
      <PageHeader title={section.label} description="Developer portal" />
      <DeveloperSubnav current={sectionKey} />
      <EmptyState
        title="Section not implemented"
        description="This developer section key has no dedicated screen yet."
      />
    </>
  );
}
