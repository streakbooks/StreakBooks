#!/usr/bin/env node
import { readUiSource } from "./lib/ui-route-source.mjs";
/**
 * Source audit for the actual LinkBooks app, complementary to Chromium fixture
 * tests and authenticated Playwright journeys. False successes are not allowed.
 * Only treat an element as navigational when it leads to a distinct URL.
 */

const read = (path) => readUiSource(path).source;
const failures = [];
const required = [
  ["src/components/layout/AppShell.tsx", ["<Link", "<NavLink", 'aria-label="Main"']],
  [
    "src/components/common/ModuleSubnav.tsx",
    ["<Link", "SettingsDestinationLink", "aria-current", "search={item.search"],
  ],
  [
    "src/components/banking/BankingSubnav.tsx",
    ["<ModuleSubnav", 'label="Banking"', 'to: "/banking/transactions"', 'to: "/banking/reconcile"'],
  ],
  ["src/components/settings/SettingsNav.tsx", ["<Link"]],
  ["src/components/settings/SettingsOverviewPanel.tsx", ["<Link", 'to="/settings"']],
  ["src/components/settings/SettingsCommandPalette.tsx", ["<Link", "onLinkClick"]],
  ["src/components/layout/GlobalSearch.tsx", ["<Link", "handleNativeLinkClick"]],
  [
    "src/routes/_authenticated/purchases/bills.index.tsx",
    ['to="/purchases/bills"', 'to="/purchases/bills/$billId"'],
  ],
  [
    "src/routes/_authenticated/purchases/recurring.tsx",
    ['to="/purchases/recurring"', 'role="tab"'],
  ],
  ["src/routes/_authenticated/accounting.tsx", ['to="/accounting"', 'role="tab"']],
  ["src/routes/_authenticated/tax.tsx", ['to="/tax"', 'role="tab"']],
  ["src/routes/_authenticated/contacts/index.tsx", ['to="/contacts"', 'role="tab"']],
  [
    "src/routes/_authenticated/contacts/$contactId.tsx",
    ['to="/contacts/$contactId"', 'role="tab"'],
  ],
  ["src/routes/_authenticated/fixed-assets.tsx", ['to="/fixed-assets"', 'role="tab"']],
  [
    "src/routes/_authenticated/reports/index.tsx",
    ['to="/reports"', 'role="tab"', 'aria-label="Reporting modules"'],
  ],
  ["src/components/reports/ReportingHome.tsx", ['to="/reports"', "Open custom library"]],
  ["src/components/reports/ReportPacksWorkspace.tsx", ['to="/reports"', "pack: p.id"]],
  ["src/components/reports/SavedViews.tsx", ['to="/reports/$reportId"']],
  ["src/routes/_authenticated/files.tsx", ['to="/files"', "folder: folder.id", "file: f.id"]],
  ["src/routes/_authenticated/notifications.tsx", ['to="/notifications"', "href={path}"]],
  ["src/components/platform/PlatformOverview.tsx", ['to="/platform"']],
  ["src/routes/_authenticated/platform.tsx", ['to="/platform"']],
  ["src/lib/navigation/native-tab.ts", ["handleNativeTabKeyDown", "nativeTabLinkClass"]],
];
for (const [file, markers] of required) {
  try {
    const source = read(file);
    for (const marker of markers)
      if (!source.includes(marker))
        failures.push(`${file} lacks expected native navigation: ${marker}`);
  } catch (error) {
    failures.push(
      `${file} could not be audited: ${error instanceof Error ? error.message : error}`,
    );
  }
}

const oldRedirect = read("src/routes/_authenticated/purchases/bills.index.tsx");
if (oldRedirect.includes("window.location.href"))
  failures.push("Bills workspace must not use window.location.href for in-app record navigation.");

for (const file of [
  "src/routes/_authenticated/accounting.tsx",
  "src/routes/_authenticated/reports/index.tsx",
  "src/routes/_authenticated/contacts/index.tsx",
  "src/routes/_authenticated/contacts/$contactId.tsx",
  "src/routes/_authenticated/tax.tsx",
  "src/routes/_authenticated/fixed-assets.tsx",
  "src/routes/_authenticated/purchases/recurring.tsx",
  "src/routes/_authenticated/settings.tsx",
]) {
  const source = read(file);
  if (!source.includes("onKeyDown={handleNativeTabKeyDown}"))
    failures.push(`${file}: hyperlink tablist keyboard navigation missing`);
}

const reports = read("src/routes/_authenticated/reports/index.tsx");
const tabs =
  read("src/lib/reports/centre-search.ts")
    .match(/export const REPORTING_TABS = \[([\s\S]*?)\] as const;/)?.[1]
    ?.match(/"[^"]+"/g)
    ?.map((value) => JSON.parse(value)) ?? [];
if (tabs.length !== 11) failures.push(`Expected 11 supported reporting tabs; found ${tabs.length}`);
for (const tab of tabs)
  if (!reports.includes(`["${tab}",`) && !reports.includes(`["${tab}"`))
    failures.push(`Reports Centre is missing the ${tab} native section link.`);

// Comprehensive top-level source/route coverage; not a claim of live functionality.
const EXPECTED_TOP_LEVEL = new Map([
  [
    "Dashboard",
    "/"
  ],
  [
    "Banking",
    "/banking"
  ],
  [
    "Sales",
    "/sales"
  ],
  [
    "Purchases",
    "/purchases"
  ],
  [
    "Expenses",
    "/expense-management"
  ],
  [
    "CRM",
    "/crm"
  ],
  [
    "HR",
    "/hr"
  ],
  [
    "Contacts",
    "/contacts"
  ],
  [
    "Products & Services",
    "/products-services"
  ],
  [
    "Files",
    "/files"
  ],
  [
    "Accounting",
    "/accounting"
  ],
  [
    "Messages",
    "/messages"
  ],
  [
    "Action Center",
    "/notifications"
  ],
  [
    "Budgets",
    "/budgets"
  ],
  [
    "Fixed assets",
    "/fixed-assets"
  ],
  [
    "Payroll",
    "/payroll"
  ],
  [
    "Reports",
    "/reports"
  ],
  [
    "Tax",
    "/tax"
  ],
  [
    "Accountant",
    "/accountant"
  ],
  [
    "Firm",
    "/firm"
  ],
  [
    "Advisors",
    "/advisors-admin"
  ],
  [
    "Advisors portal",
    "/advisors-portal"
  ],
  [
    "App Store",
    "/app-store"
  ],
  [
    "Developer",
    "/developer"
  ],
  [
    "AI Assistant",
    "/ai-assistant"
  ],
  [
    "Settings",
    "/settings"
  ],
  [
    "Help",
    "/help"
  ]
]);
const registeredRoutePaths = new Set(
  [...read("src/routeTree.gen.ts").matchAll(/\bpath:\s*'([^']+)'/g)]
    .map((match) => match[1].replace(/\/+$/, "") || "/"),
);
const navigationEntries = [...read("src/lib/nav.ts").matchAll(
  /\blabel:\s*"([^"]+)"\s*,\s*to:\s*"([^"]+)"/g,
)].map((match) => ({ label: match[1], to: match[2] }));
const seenLabels = new Set();
const seenPaths = new Set();
for (const item of navigationEntries) {
  if (seenLabels.has(item.label)) failures.push(`Duplicate sidebar label: ${item.label}`);
  if (seenPaths.has(item.to)) failures.push(`Duplicate sidebar destination: ${item.to}`);
  seenLabels.add(item.label);
  seenPaths.add(item.to);
  if (!registeredRoutePaths.has(item.to))
    failures.push(`Sidebar destination missing in generated router: ${item.label} (${item.to})`);
}
for (const [label, destination] of EXPECTED_TOP_LEVEL) {
  if (!navigationEntries.some((item) => item.label === label && item.to === destination))
    failures.push(`Missing/moved required module: ${label} -> ${destination}`);
}
if (navigationEntries.length !== EXPECTED_TOP_LEVEL.size)
  failures.push(`Expected ${EXPECTED_TOP_LEVEL.size} unique top-level modules; found ${navigationEntries.length}`);

const nav = read("src/lib/nav.ts");
const known = (nav.match(/\blabel:\s*"/g) ?? []).length;
if (known < 18)
  failures.push(`Navigation catalogue unexpectedly shrank: ${known} labelled entries`);

if (failures.length) {
  for (const reason of failures) process.stderr.write(`FAIL ${reason}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `Native navigation source audit passed: ${required.length} files and ${tabs.length} reporting tabs.\n`,
  );
}
