import { permissionsForRole } from "@/lib/permissions";
import { CREATE_ACTIONS, CREATE_GROUP_LABEL, type CreateAction } from "@/lib/create-new/registry";

/**
 * Full-page Create destinations (browser history + TransactionWorkspace).
 * Quick panels without a dedicated workspace stay as flyovers.
 */
const CREATE_FLYOVER_ONLY = new Set(["account", "project", "document_upload"]);

const MONEY_DOCUMENT_KINDS = [
  "sales_receipt",
  "customer_refund",
  "supplier_refund",
  "bank_deposit",
  "card_payment",
  "bank_adjustment",
] as const;

export type CreateNavTarget =
  | { kind: "flyover" }
  | {
      kind: "route";
      to: string;
      search?: Record<string, string | boolean>;
      params?: Record<string, string>;
    };

export function opensCreateAsFullPage(action: CreateAction): boolean {
  if (!action.route) return false;
  if (CREATE_FLYOVER_ONLY.has(action.id)) return false;
  return true;
}

/**
 * Single owner for Create destinations so bare `action.route` never drops create intent
 * (product/claim need `create=true`; journals need mode; money docs need kind).
 */
export function createNavTarget(action: CreateAction): CreateNavTarget {
  if (!opensCreateAsFullPage(action) || !action.route) return { kind: "flyover" };

  switch (action.id) {
    case "customer":
      return { kind: "route", to: "/contacts/new", search: { kind: "customer" } };
    case "supplier":
      return { kind: "route", to: "/contacts/new", search: { kind: "supplier" } };
    case "manual_journal":
      return { kind: "route", to: "/accounting/journals/new", search: { mode: "post" } };
    case "recurring_journal":
      return { kind: "route", to: "/accounting/journals/new", search: { mode: "template" } };
    case "recurring_bill":
      return { kind: "route", to: "/purchases/recurring/new" };
    case "recurring_invoice":
      return { kind: "route", to: "/sales/recurring/new" };
    case "receive_money":
      return { kind: "route", to: "/banking/receive-money" };
    case "expense":
      return { kind: "route", to: "/banking/spend-money" };
    case "bank_transfer":
      return { kind: "route", to: "/banking/transfers/new" };
    case "product":
      return { kind: "route", to: "/products-services", search: { create: true } };
    case "fixed_asset":
      return { kind: "route", to: "/fixed-assets", search: { create: true } };
    case "sales_order":
      return { kind: "route", to: "/sales/orders/new" };
    case "purchase_requisition":
      return { kind: "route", to: "/purchases/requisitions", search: { create: true } };
    case "reimbursement":
      return {
        kind: "route",
        to: "/expense-management/$section",
        params: { section: "my-expenses" },
        search: { create: true },
      };
    default: {
      const moneyKind = MONEY_DOCUMENT_KINDS.find((id) => id === action.id);
      if (moneyKind) {
        return {
          kind: "route",
          to: "/banking/money-documents/new",
          search: { kind: moneyKind },
        };
      }
      return { kind: "route", to: action.route };
    }
  }
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
