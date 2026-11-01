import type { Permission } from "@/lib/permissions";
import type { VoiceOption } from "./actions";

export type VoiceLine = {
  description: string;
  accountId: string;
  quantity: string;
  unitPrice: string;
  discount: string;
  taxRateBps: string;
  taxCodeId: string;
};
export type VoiceDraft = {
  contactId: string;
  date: string;
  dueDate: string;
  currency: string;
  memo: string;
  number: string;
  lines: VoiceLine[];
};
export type VoiceFormAdapter = {
  token: string;
  companyId: string;
  module: "invoice" | "quote" | "credit_note" | "bill";
  permission: Permission;
  revision: string;
  ready: boolean;
  busy: boolean;
  today: string;
  dateFormat?: string;
  draft: VoiceDraft;
  contacts: VoiceOption[];
  paymentTerms?: VoiceOption[];
  selectPaymentTerm?(id: string): void;
  accounts: VoiceOption[];
  taxes: VoiceOption[];
  currencies: string[];
  selectContact(id: string): void;
  update(patch: Partial<Omit<VoiceDraft, "lines" | "contactId">>): void;
  updateLines(lines: VoiceLine[]): void;
  validate(): string[];
  saveDraft(): Promise<{ id: string; warning?: string }>;
};

export function describeDraft(form: VoiceFormAdapter): string[] {
  const d = form.draft;
  return [
    `Draft ${form.module.replace("_", " ")} only — no posting, sending or payment.`,
    `Contact: ${form.contacts.find((c) => c.id === d.contactId)?.name ?? "Not selected"}`,
    `Date: ${d.date}; due/expiry: ${d.dueDate || "Not applicable"}; currency: ${d.currency}`,
    `Number: ${d.number || "Automatic"}; memo: ${d.memo || "None"}`,
    ...d.lines.map(
      (line, i) =>
        `${i + 1}. ${line.description || "Blank line"}; account ${form.accounts.find((a) => a.id === line.accountId)?.name ?? "not selected"}; quantity ${line.quantity}; unit price ${d.currency} ${line.unitPrice}; discount ${line.discount}; tax ${form.taxes.find((t) => t.id === line.taxCodeId)?.name ?? `${Number(line.taxRateBps) / 100}%`}`,
    ),
    "Includes notes and attachments entered in the form. Existing server validation applies.",
  ];
}

export function validateVoiceDraft(draft: VoiceDraft, dueRequired: boolean): string[] {
  const errors: string[] = [];
  if (!draft.contactId) errors.push("Select a customer or supplier.");
  if (!draft.date) errors.push("Set the document date.");
  if (dueRequired && !draft.dueDate) errors.push("Set the due date.");
  if (draft.dueDate && draft.dueDate < draft.date)
    errors.push("Due date cannot be before the document date.");
  if (!draft.currency) errors.push("Choose the currency.");
  if (!draft.lines.length) errors.push("Add a line item.");
  for (const [i, line] of draft.lines.entries()) {
    if (
      !line.description.trim() ||
      !line.accountId ||
      !(Number(line.quantity) > 0) ||
      !(Number(line.unitPrice) > 0)
    )
      errors.push(`Complete description, account, quantity and positive price on line ${i + 1}.`);
  }
  return errors;
}
