export type UsableCustomerList = {
  id: string;
  currency_code: string;
  is_active: boolean;
};

/** Read-only preference: use a list only when it is active and uses the document currency. */
export function usableCustomerPriceList(
  list: UsableCustomerList | null | undefined,
  documentCurrency: string,
): string | null {
  if (!list || !list.is_active || list.currency_code !== documentCurrency) return null;
  return list.id;
}

/**
 * User selection wins over customer defaults; an explicit 'Catalogue prices'
 * selection is represented by the empty string, not null. Document existing
 * prices are never mutated by this preference resolver.
 */
export function resolvedDraftPriceList(
  manualSelection: string | null,
  customerDefaultId: string | null | undefined,
): string {
  return manualSelection === null ? customerDefaultId ?? "" : manualSelection;
}
