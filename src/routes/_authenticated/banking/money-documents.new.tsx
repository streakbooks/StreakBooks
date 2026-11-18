import { createFileRoute } from "@tanstack/react-router";
import { MoneyDocumentPanel } from "@/components/create-new/MoneyDocumentPanel";

const KINDS = [
  "sales_receipt",
  "customer_refund",
  "supplier_refund",
  "receive_money",
  "bank_deposit",
  "card_payment",
  "bank_adjustment",
] as const;

type MoneyKind = (typeof KINDS)[number];

function isMoneyKind(value: unknown): value is MoneyKind {
  return typeof value === "string" && (KINDS as readonly string[]).includes(value);
}

export const Route = createFileRoute("/_authenticated/banking/money-documents/new")({
  validateSearch: (search: Record<string, unknown>): { kind: MoneyKind } => ({
    kind: isMoneyKind(search["kind"]) ? search["kind"] : "receive_money",
  }),
  head: ({ match }) => ({
    meta: [{ title: `New ${match.search.kind.replace(/_/g, " ")} — LinkBooks` }],
  }),
  component: MoneyDocumentNewRoute,
});

function MoneyDocumentNewRoute() {
  const { kind } = Route.useSearch();
  return <MoneyDocumentPanel kind={kind} />;
}
