import { HrSubnav } from "@/components/hr/HrSubnav";
import { EmptyState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Button } from "@/components/ui/button";
import { hrSection, type HrSectionKey } from "@/lib/hr/sections";
import { HrEmployeesPage } from "@/screens/hr/employees";
import { HrOrganizationPage } from "@/screens/hr/organization";
import { HrSettingsPage } from "@/screens/hr/settings";
import { HrAuditPage } from "@/screens/hr/audit";
import { HrRecruitmentPage } from "@/screens/hr/recruitment";
import { HrOnboardingPage } from "@/screens/hr/onboarding";
import { HrAttendancePage } from "@/screens/hr/attendance";
import { HrShiftsPage } from "@/screens/hr/shifts";
import { HrLeavePage } from "@/screens/hr/leave";
import { HrHolidaysPage } from "@/screens/hr/holidays";
import { HrSelfServicePage } from "@/screens/hr/self-service";
import { HrManagerPage } from "@/screens/hr/manager";
import { HrApprovalsPage } from "@/screens/hr/approvals";
import { HrDocumentsPage } from "@/screens/hr/documents";
import { HrAssetsPage } from "@/screens/hr/assets";
import { HrRelationsPage } from "@/screens/hr/relations";
import { HrPerformancePage } from "@/screens/hr/performance";
import { HrTrainingPage } from "@/screens/hr/training";
import { HrCompensationPage } from "@/screens/hr/compensation";
import { HrTransfersPage } from "@/screens/hr/transfers";
import { HrOffboardingPage } from "@/screens/hr/offboarding";
import { HrReportsPage } from "@/screens/hr/reports";
import { HrAutomationsPage } from "@/screens/hr/automations";

/**
 * Dispatches HR section routes. Wired batches render real screens.
 * Later batches stay honest and fail-closed — no fake KPIs or dummy actions.
 */
export function HrSectionPage({ sectionKey }: { sectionKey: HrSectionKey }) {
  if (sectionKey === "employees") return <HrEmployeesPage />;
  if (sectionKey === "organization") return <HrOrganizationPage />;
  if (sectionKey === "recruitment") return <HrRecruitmentPage />;
  if (sectionKey === "onboarding") return <HrOnboardingPage />;
  if (sectionKey === "attendance") return <HrAttendancePage />;
  if (sectionKey === "shifts") return <HrShiftsPage />;
  if (sectionKey === "leave") return <HrLeavePage />;
  if (sectionKey === "holidays") return <HrHolidaysPage />;
  if (sectionKey === "self-service") return <HrSelfServicePage />;
  if (sectionKey === "manager") return <HrManagerPage />;
  if (sectionKey === "approvals") return <HrApprovalsPage />;
  if (sectionKey === "documents") return <HrDocumentsPage />;
  if (sectionKey === "assets") return <HrAssetsPage />;
  if (sectionKey === "relations") return <HrRelationsPage />;
  if (sectionKey === "performance") return <HrPerformancePage />;
  if (sectionKey === "training") return <HrTrainingPage />;
  if (sectionKey === "compensation") return <HrCompensationPage />;
  if (sectionKey === "transfers") return <HrTransfersPage />;
  if (sectionKey === "offboarding") return <HrOffboardingPage />;
  if (sectionKey === "reports") return <HrReportsPage />;
  if (sectionKey === "automations") return <HrAutomationsPage />;
  if (sectionKey === "settings") return <HrSettingsPage />;
  if (sectionKey === "audit") return <HrAuditPage />;

  const section = hrSection(sectionKey);

  return (
    <ListWorkspace
      title={section.label}
      description={`Scheduled for ${section.batch}. Navigation and permissions are live; domain workflows remain fail-closed until that batch lands.`}
      breadcrumbs={[{ label: "HR", to: "/hr" }, { label: section.label }]}
    >
      <HrSubnav current={sectionKey} />
      <EmptyState
        title={`${section.label} arrives in ${section.batch}`}
        description="This surface is registered for deep links and access control. Backend capabilities will ship in the listed batch with real authorization and persistence."
        action={
          <Button type="button" disabled title="Blocked until authorised backend exists">
            Actions unavailable
          </Button>
        }
      />
    </ListWorkspace>
  );
}
