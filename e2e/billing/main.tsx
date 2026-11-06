import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "../../src/components/ui/sonner";
import { ReferralPanel } from "../../src/components/billing/ReferralPanel";
import { FirmPartnerPanel } from "../../src/components/firm/FirmPartnerPanel";
import { PartnerProgramAdmin } from "../../src/components/platform/billing/PartnerProgramAdmin";
import { BillingAnalyticsAdmin } from "../../src/components/platform/billing/BillingAnalyticsAdmin";
import { FIRM_ID } from "./partner-functions";
import "../../src/styles.css";

const params = new URLSearchParams(location.search);
const view = params.get("view") ?? "referral";
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

const viewElement =
  view === "partner" ? (
    <FirmPartnerPanel firmId={FIRM_ID} canManage={!params.has("member")} />
  ) : view === "partner-admin" ? (
    <PartnerProgramAdmin canEdit isOwner />
  ) : view === "analytics" ? (
    <BillingAnalyticsAdmin />
  ) : (
    <ReferralPanel companyId="20000000-0000-4000-8000-000000000001" />
  );

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={client}>
    <main className="mx-auto max-w-4xl p-6">{viewElement}</main>
    <Toaster />
  </QueryClientProvider>,
);
