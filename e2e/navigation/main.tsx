// Isolated browser integration fixture for the production native navigation primitives.
// Authentication/RLS and live page integrations are exercised separately by e2e/native-navigation.spec.ts.
import { createRoot } from "react-dom/client";
import {
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  Outlet,
  Link,
} from "@tanstack/react-router";
import { nativeTabLinkClass, handleNativeTabKeyDown } from "../../src/lib/navigation/native-tab";
import { REPORTING_TABS, parseReportingCentreSearch } from "../../src/lib/reports/centre-search";
import "../../src/styles.css";

const labels: Record<(typeof REPORTING_TABS)[number], string> = {
  home: "Reporting home",
  standard: "Standard reports",
  custom: "Custom reports",
  management: "Management reports",
  packs: "Report packs",
  adviser: "Adviser",
  drafts: "Drafts & review",
  published: "Published",
  archived: "Archived",
  schedules: "Scheduled delivery",
  templates: "Templates",
};

const root = createRootRoute({
  component: () => (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <nav aria-label="Main" className="flex flex-wrap gap-4">
        <Link to="/sales">Sales</Link>
        <Link to="/purchases">Purchases</Link>
        <Link to="/accounting">Accounting</Link>
        <Link to="/reports" search={{ tab: "home" }}>
          Reports
        </Link>
        <Link to="/files">Files</Link>
      </nav>
      <Outlet />
    </main>
  ),
});
const home = createRoute({
  getParentRoute: () => root,
  path: "/",
  component: () => <h1>LinkBooks navigation fixture</h1>,
});
const sales = createRoute({
  getParentRoute: () => root,
  path: "/sales",
  component: () => <h1>Sales workspace</h1>,
});
const purchases = createRoute({
  getParentRoute: () => root,
  path: "/purchases",
  component: () => (
    <section>
      <h1>Purchases workspace</h1>
      <Link to="/purchases" search={{ tab: "drafts" }}>
        Draft bills
      </Link>
    </section>
  ),
  validateSearch: (raw: Record<string, unknown>) => ({
    tab: raw["tab"] === "drafts" ? "drafts" : undefined,
  }),
});
const accountingTabs = ["coa", "journals", "periods", "fx"] as const;
const accounting = createRoute({
  getParentRoute: () => root,
  path: "/accounting",
  validateSearch: (raw: Record<string, unknown>): { tab?: string | undefined } => ({
    tab: accountingTabs.includes(raw["tab"] as (typeof accountingTabs)[number])
      ? String(raw["tab"])
      : undefined,
  }),
  component: () => {
    const search = accounting.useSearch();
    const active = search.tab ?? "coa";
    return (
      <section>
        <h1>Accounting workspace</h1>
        <nav
          aria-label="Accounting tabs"
          role="tablist"
          onKeyDown={handleNativeTabKeyDown}
          className="flex gap-2"
        >
          {accountingTabs.map((tab) => (
            <Link
              key={tab}
              to="/accounting"
              search={{ tab }}
              role="tab"
              aria-selected={active === tab}
              data-state={active === tab ? "active" : "inactive"}
              className={nativeTabLinkClass}
            >
              {tab === "coa"
                ? "Chart of accounts"
                : tab === "journals"
                  ? "Journals"
                  : tab === "periods"
                    ? "Financial years"
                    : "FX"}
            </Link>
          ))}
        </nav>
        <output data-testid="active-accounting-tab">{active}</output>
      </section>
    );
  },
});
const reports = createRoute({
  getParentRoute: () => root,
  path: "/reports",
  validateSearch: parseReportingCentreSearch,
  component: () => {
    const search = parseReportingCentreSearch(reports.useSearch() as Record<string, unknown>);
    const tab = search.tab ?? "home";
    return (
      <section>
        <h1>Reports Centre</h1>
        <nav
          aria-label="Reporting modules"
          role="tablist"
          onKeyDown={handleNativeTabKeyDown}
          className="flex flex-wrap gap-2"
        >
          {REPORTING_TABS.map((id) => (
            <Link
              key={id}
              to="/reports"
              search={{ ...search, tab: id, pack: undefined }}
              role="tab"
              aria-selected={tab === id}
              data-state={tab === id ? "active" : "inactive"}
              className={nativeTabLinkClass}
            >
              {labels[id]}
            </Link>
          ))}
        </nav>
        <output data-testid="active-report-tab">{tab}</output>
        <Link to="/reports" search={{ tab: "packs", pack: "deafcafe-1111-4111-8111-aabc12345678" }}>
          Open report pack
        </Link>
        <output data-testid="active-report-pack">{search.pack ?? "none"}</output>
      </section>
    );
  },
});
const files = createRoute({
  getParentRoute: () => root,
  path: "/files",
  validateSearch: (raw: Record<string, unknown>): { folder?: string | undefined } => ({
    folder: typeof raw["folder"] === "string" ? raw["folder"] : undefined,
  }),
  component: () => {
    const { folder } = files.useSearch();
    return (
      <section>
        <h1>Files workspace</h1>
        <nav aria-label="Document folders" className="flex gap-3">
          <Link to="/files" search={{ folder: undefined }}>
            All files
          </Link>
          <Link to="/files" search={{ folder: "folder-a" }}>
            Folder A
          </Link>
        </nav>
        <output data-testid="active-folder">{folder ?? "root"}</output>
      </section>
    );
  },
});
const routeTree = root.addChildren([home, sales, purchases, accounting, reports, files]);
const router = createRouter({ routeTree });
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
