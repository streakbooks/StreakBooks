import { lazy, Suspense, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { AppStoreSubnav } from "@/components/app-store/AppStoreSubnav";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { EmptyState, LoadingState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCan } from "@/hooks/use-can";
import { appStoreSection, type AppStoreSectionKey } from "@/lib/app-store/sections";
import type { Permission } from "@/lib/permissions";

const AppStoreExplorePage = lazy(() =>
  import("@/screens/app-store/explore").then((m) => ({ default: m.AppStoreExplorePage })),
);
const AppStoreCategoriesPage = lazy(() =>
  import("@/screens/app-store/categories").then((m) => ({ default: m.AppStoreCategoriesPage })),
);
const AppStoreFeaturedPage = lazy(() =>
  import("@/screens/app-store/featured").then((m) => ({ default: m.AppStoreFeaturedPage })),
);
const AppStoreMyAppsPage = lazy(() =>
  import("@/screens/app-store/my-apps").then((m) => ({ default: m.AppStoreMyAppsPage })),
);
const AppStoreConnectionsPage = lazy(() =>
  import("@/screens/app-store/connections").then((m) => ({ default: m.AppStoreConnectionsPage })),
);
const AppStorePrivacyPage = lazy(() =>
  import("@/screens/app-store/privacy").then((m) => ({ default: m.AppStorePrivacyPage })),
);
const AppStoreRequestsPage = lazy(() =>
  import("@/screens/app-store/requests").then((m) => ({ default: m.AppStoreRequestsPage })),
);
const AppStoreAdvisoryPage = lazy(() =>
  import("@/screens/app-store/advisory").then((m) => ({ default: m.AppStoreAdvisoryPage })),
);
const AppStoreTrustPage = lazy(() =>
  import("@/screens/app-store/trust").then((m) => ({ default: m.AppStoreTrustPage })),
);
const AppStoreRegisterPage = lazy(() =>
  import("@/screens/app-store/register").then((m) => ({ default: m.AppStoreRegisterPage })),
);
const AppStoreSyncActivityPage = lazy(() =>
  import("@/screens/app-store/sync-activity").then((m) => ({
    default: m.AppStoreSyncActivityPage,
  })),
);
const AppStoreExceptionsPage = lazy(() =>
  import("@/screens/app-store/exceptions").then((m) => ({ default: m.AppStoreExceptionsPage })),
);
const AppStoreBillingPage = lazy(() =>
  import("@/screens/app-store/billing").then((m) => ({ default: m.AppStoreBillingPage })),
);
const AppStoreReviewsPage = lazy(() =>
  import("@/screens/app-store/reviews").then((m) => ({ default: m.AppStoreReviewsPage })),
);
const AppStoreAdminPage = lazy(() =>
  import("@/screens/app-store/admin").then((m) => ({ default: m.AppStoreAdminPage })),
);

function SectionSuspense({ children }: { children: ReactNode }) {
  return <Suspense fallback={<LoadingState />}>{children}</Suspense>;
}

export function AppStoreSectionPage({ sectionKey }: { sectionKey: AppStoreSectionKey }) {
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const section = appStoreSection(sectionKey);

  if (sectionKey === "explore") {
    return (
      <SectionSuspense>
        <AppStoreExplorePage />
      </SectionSuspense>
    );
  }
  if (sectionKey === "categories") {
    return (
      <SectionSuspense>
        <AppStoreCategoriesPage />
      </SectionSuspense>
    );
  }
  if (sectionKey === "featured") {
    return (
      <SectionSuspense>
        <AppStoreFeaturedPage />
      </SectionSuspense>
    );
  }
  if (sectionKey === "register") {
    return (
      <SectionSuspense>
        <AppStoreRegisterPage />
      </SectionSuspense>
    );
  }
  if (sectionKey === "sync-activity") {
    return (
      <SectionSuspense>
        <AppStoreSyncActivityPage />
      </SectionSuspense>
    );
  }
  if (sectionKey === "my-apps") {
    return (
      <SectionSuspense>
        <AppStoreMyAppsPage />
      </SectionSuspense>
    );
  }
  if (sectionKey === "connections") {
    return (
      <SectionSuspense>
        <AppStoreConnectionsPage />
      </SectionSuspense>
    );
  }
  if (sectionKey === "privacy") {
    return (
      <SectionSuspense>
        <AppStorePrivacyPage />
      </SectionSuspense>
    );
  }
  if (sectionKey === "requests") {
    return (
      <SectionSuspense>
        <AppStoreRequestsPage />
      </SectionSuspense>
    );
  }
  if (sectionKey === "advisory") {
    return (
      <SectionSuspense>
        <AppStoreAdvisoryPage />
      </SectionSuspense>
    );
  }
  if (sectionKey === "trust") {
    return (
      <SectionSuspense>
        <AppStoreTrustPage />
      </SectionSuspense>
    );
  }
  if (sectionKey === "exceptions") {
    return (
      <SectionSuspense>
        <AppStoreExceptionsPage />
      </SectionSuspense>
    );
  }
  if (sectionKey === "billing") {
    return (
      <SectionSuspense>
        <AppStoreBillingPage />
      </SectionSuspense>
    );
  }
  if (sectionKey === "reviews") {
    return (
      <SectionSuspense>
        <AppStoreReviewsPage />
      </SectionSuspense>
    );
  }
  if (sectionKey === "admin") {
    return (
      <SectionSuspense>
        <AppStoreAdminPage />
      </SectionSuspense>
    );
  }

  if (isPending) return <LoadingState />;
  if (!company) {
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  }

  const allowed = section.anyOf.some((permission) => can(permission as Permission));
  if (!allowed) {
    return (
      <ListWorkspace
        title={section.label}
        description="App Store"
        subnav={<AppStoreSubnav current={sectionKey} />}
      >
        <EmptyState title="No access" description="Your role cannot open this App Store section." />
      </ListWorkspace>
    );
  }

  return (
    <ListWorkspace
      title={section.label}
      description="Part of the LinkBooks App Store and open integration platform."
      actions={
        <Button asChild variant="outline" size="sm">
          <Link to="/app-store">Back to overview</Link>
        </Button>
      }
      subnav={<AppStoreSubnav current={sectionKey} />}
    >
      <Alert className="mb-6">
        <AlertTitle>
          {section.label} continues in {section.batch}
        </AlertTitle>
        <AlertDescription>
          Navigation, permissions and catalogue foundations are live. This workspace does not
          simulate installation success, payments or synchronization. Real connector workflows are
          delivered when credentials and E2E verification allow.
        </AlertDescription>
      </Alert>
      <EmptyState
        title={`${section.label} workspace ready`}
        description="Foundation schema and role checks are in place. Feature implementation continues in the scheduled batch."
        action={
          <Button asChild size="sm">
            <Link to="/app-store/$section" params={{ section: "explore" }}>
              Explore apps
            </Link>
          </Button>
        }
      />
    </ListWorkspace>
  );
}
