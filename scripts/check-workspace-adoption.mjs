#!/usr/bin/env node
/**
 * Source evidence that high-traffic modules compose ListWorkspace / RecordWorkspace.
 * Complements PageHeader-bypass checks in check-module-contracts.mjs.
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

const required = [
  ["src/routes/_authenticated/banking/index.tsx", "ListWorkspace"],
  ["src/routes/_authenticated/banking/transactions.tsx", "ListWorkspace"],
  ["src/routes/_authenticated/banking/reconcile.tsx", "ListWorkspace"],
  ["src/screens/banking/transfers.tsx", "ListWorkspace"],
  ["src/routes/_authenticated/sales/index.tsx", "ListWorkspace"],
  ["src/routes/_authenticated/sales/invoices.index.tsx", "ListWorkspace"],
  ["src/routes/_authenticated/sales/invoices.$invoiceId.index.tsx", "RecordWorkspace"],
  ["src/routes/_authenticated/purchases/index.tsx", "ListWorkspace"],
  ["src/screens/contacts/index.tsx", "ListWorkspace"],
  ["src/routes/_authenticated/contacts/$contactId.tsx", "RecordWorkspace"],
  ["src/routes/_authenticated/notifications.tsx", "ListWorkspace"],
  ["src/routes/_authenticated/index.tsx", "ListWorkspace"],
  ["src/screens/accounting.tsx", "ListWorkspace"],
  ["e2e/ui/main.tsx", "ListWorkspace"],
  ["e2e/ui/main.tsx", "RecordWorkspace"],
];

for (const [rel, token] of required) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) {
    failures.push(`Missing required file: ${rel}`);
    continue;
  }
  const source = fs.readFileSync(file, "utf8");
  if (!source.includes(token)) {
    failures.push(`${rel} must compose ${token}`);
  }
}

if (failures.length) {
  for (const reason of failures) process.stderr.write(`FAIL ${reason}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `Workspace adoption passed: ${required.length} high-traffic surfaces compose shared chrome.\n`,
  );
}
