import { lazy, Suspense } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useActiveCompany } from "@/hooks/use-active-company";
import { LoadingState, EmptyState } from "@/components/common/states";
import { SalesSubnav } from "@/components/sales/SalesSubnav";
import { PurchasesSubnav } from "@/components/purchases/PurchasesSubnav";
import { BankingSubnav } from "@/components/banking/BankingSubnav";
import { ModuleSettingsLinks } from "./ModuleSettingsLinks";
import { SettingsPanelFrame } from "./SettingsPanelFrame";
import type { SettingsPanelId } from "@/lib/settings/panels";
import type { SettingsCategory } from "@/lib/settings/categories";
const Contacts = lazy(() =>
  import("./ContactSettingsContent").then((m) => ({ default: m.ContactSettingsContent })),
);
const Branding = lazy(() =>
  import("@/routes/_authenticated/documents.branding").then((m) => ({
    default: m.BrandingWorkspace,
  })),
);
const Settings = lazy(() =>
  import("@/routes/_authenticated/settings").then((m) => ({ default: m.SettingsForCompany })),
);
const SalesDefaults = lazy(() =>
  import("./SalesDefaultsForm").then((m) => ({ default: m.SalesDefaultsForm })),
);
const PurchasesDefaults = lazy(() =>
  import("./PurchasesDefaultsForm").then((m) => ({ default: m.PurchasesDefaultsForm })),
);
const Reminders = lazy(() =>
  import("./ReminderSettingsContent").then((m) => ({ default: m.ReminderSettingsContent })),
);
const Rules = lazy(() =>
  import("./BankRulesContent").then((m) => ({ default: m.BankRulesContent })),
);
const Feeds = lazy(() =>
  import("./BankFeedsContent").then((m) => ({ default: m.BankFeedsContent })),
);
const BankImport = lazy(() =>
  import("./BankImportContent").then((m) => ({ default: m.BankImportContent })),
);
export function InPlaceSettingsPanel({
  panel,
  insideCentre = false,
}: {
  panel: SettingsPanelId;
  insideCentre?: boolean;
}) {
  const { company, isPending } = useActiveCompany();
  const { pathname, search } = useRouterState({ select: (s) => s.location });
  if (isPending) return <LoadingState />;
  if (!company) return <EmptyState title="No organisation" description="Select a company first." />;
  const companyId = company.id;
  let content: React.ReactNode;
  if (panel === "supplier-defaults" || panel === "customer-defaults")
    content = (
      <div className="space-y-6">
        {panel === "supplier-defaults" ? (
          <PurchasesDefaults companyId={companyId} />
        ) : (
          <SalesDefaults companyId={companyId} />
        )}
        <Contacts embedded sharedOnly />
      </div>
    );
  else if (panel === "contact-settings") content = <Contacts embedded />;
  else if (panel === "sales-defaults") content = <SalesDefaults companyId={companyId} />;
  else if (panel === "purchases-defaults") content = <PurchasesDefaults companyId={companyId} />;
  else if (panel === "branding")
    content = (
      <BrandingWorkspaceEmbedded
        origin={
          pathname.startsWith("/purchases") ||
          (pathname === "/settings" &&
            (search as Record<string, unknown>)["section"] === "purchases")
            ? "purchases"
            : "sales"
        }
      />
    );
  else if (panel === "reminders") content = <Reminders embedded />;
  else if (panel === "bank-rules") content = <Rules embedded />;
  else if (panel === "bank-feeds") content = <Feeds embedded />;
  else if (panel === "bank-import") content = <BankImport embedded />;
  else {
    const section: SettingsCategory =
      panel === "numbering"
        ? "documents"
        : panel === "portals"
          ? "portals"
          : (panel.slice(9) as SettingsCategory);
    content = (
      <>
        {section === "banking" && <ModuleSettingsLinks category="banking" />}
        <Settings companyId={companyId} embeddedSection={section} />
      </>
    );
  }
  return (
    <div key={`${companyId}:${panel}`}>
      {!insideCentre && (pathname.startsWith("/sales/") || pathname === "/sales") && (
        <SalesSubnav />
      )}
      {!insideCentre && (pathname.startsWith("/purchases/") || pathname === "/purchases") && (
        <PurchasesSubnav />
      )}
      {!insideCentre && (pathname.startsWith("/banking/") || pathname === "/banking") && (
        <BankingSubnav />
      )}
      <SettingsPanelFrame panel={panel}>
        <Suspense fallback={<LoadingState />}>{content}</Suspense>
      </SettingsPanelFrame>
    </div>
  );
}
function BrandingWorkspaceEmbedded({ origin }: { origin: "sales" | "purchases" }) {
  return <Branding embedded origin={origin} />;
}
