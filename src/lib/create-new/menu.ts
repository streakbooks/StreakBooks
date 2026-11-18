import { permissionsForRole } from "@/lib/permissions";
import { CREATE_ACTIONS, CREATE_GROUP_LABEL, type CreateAction } from "@/lib/create-new/registry";

/**
 * Full-page Create destinations (browser history + TransactionWorkspace).
 * Quick panels without a dedicated workspace stay as flyovers.
 */
const CREATE_FLYOVER_ONLY = new Set([
  "account",
  "project",
  "document_upload",
  "manual_journal",
  "recurring_journal",
  "sales_receipt",
  "customer_refund",
  "supplier_refund",
  "receive_money",
  "bank_deposit",
  "card_payment",
  "bank_adjustment",
]);

export function opensCreateAsFullPage(action: CreateAction): boolean {
  if (!action.route) return false;
  if (CREATE_FLYOVER_ONLY.has(action.id)) return false;
  return true;
}

export function actionIsRunnable(
  action: CreateAction,
  role: string | null | undefined,
  permissions?: readonly string[],
): boolean {
  if (action.availability !== "ready") return false;
  return (permissions ?? permissionsForRole(role)).includes(action.permission);
}

export function searchCreateActions(
  query: string,
  role: string | null | undefined,
): CreateAction[] {
  const needle = query.trim().toLowerCase();
  return CREATE_ACTIONS.filter((action) => {
    if (!needle) return true;
    const haystack = [action.label, action.id, CREATE_GROUP_LABEL[action.group], ...action.aliases]
      .join(" ")
      .toLowerCase();
    return haystack.includes(needle);
  }).map((action) => action);
}

export function runnableCreateActions(role: string | null | undefined): CreateAction[] {
  return CREATE_ACTIONS.filter((action) => actionIsRunnable(action, role));
}
