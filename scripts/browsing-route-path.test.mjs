import assert from "node:assert/strict";
import test from "node:test";
import { isCanonicalRoutePath } from "./lib/browsing-route-path.mjs";

test("accepts canonical authenticated TypeScript route files", () => {
  for (const path of [
    "index.tsx", "accountant.tsx", "platform/billing.tsx",
    "advisors-admin.settings.services-pricing.tsx",
    "_layout/$companyId.tsx", "nested/route.ts",
  ]) assert.equal(isCanonicalRoutePath(path), true, path);
});

test("rejects unsafe, noncanonical and non-route paths", () => {
  for (const path of [
    "", "/index.tsx", "nested//index.tsx", "./index.tsx",
    "../index.tsx", "nested/../index.tsx", "nested/./index.tsx",
    "nested\\index.tsx", "index.jsx", "index.tsx?tab=1",
    "index.tsx#details", "index.tsx ", "folder/💰.tsx",
    "index.tsx/", "index.tsx/.", "index.tsx/..",
    null, 42, {},
  ]) assert.equal(isCanonicalRoutePath(path), false, String(path));
});

test("validates route naming boundaries consistently for module and supporting inventories", () => {
  for (const path of [
    "payroll/runs.$runId.tsx",
    "reports/builder/$viewId.tsx",
    "advisors-portal.messages.tsx",
    "_authenticated.tsx",
    "settings/index.ts",
  ]) assert.equal(isCanonicalRoutePath(path), true, path);

  for (const path of [
    "payroll//runs.$runId.tsx",
    "reports/builder/../../secrets.tsx",
    "route.tsx\\n",
    "route.tsx\\r",
    "route.tsx?return=%2Fsettings",
    "route.tsx#section",
    "route.tsx\\\\extra",
    "route.tsx/child.tsx",
    " route.tsx",
    "route.tsx ",
  ]) assert.equal(isCanonicalRoutePath(path), false, path);
});
