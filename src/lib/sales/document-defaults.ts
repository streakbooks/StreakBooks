import { addDaysIso } from "@/lib/sales/line-helpers";

export type SalesDocumentKind = "invoice" | "quote" | "credit_note";

export function salesDocumentEndDate(args: {
  kind: SalesDocumentKind;
  documentDate: string;
  customerPaymentTermsDays?: number | null | undefined;
  defaultPaymentTermsDays?: number | null | undefined;
  quoteValidityDays?: number | null | undefined;
}): string | undefined {
  if (args.kind === "invoice") {
    return addDaysIso(
      args.documentDate,
      args.customerPaymentTermsDays ?? args.defaultPaymentTermsDays ?? 30,
    );
  }
  if (args.kind === "quote") {
    return addDaysIso(args.documentDate, args.quoteValidityDays ?? 30);
  }
  return undefined;
}
