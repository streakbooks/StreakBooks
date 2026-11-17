/**
 * Fail-closed header ↔ line totals before document authorise (AR and AP).
 * Prevents posting a journal from lines while the stored header (statements / as-at) disagrees.
 */

export type AuthoriseTotalLine = {
  net_minor: number;
  tax_minor: number;
};

export function assertHeaderMatchesLines(input: {
  documentLabel: string;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  lines: ReadonlyArray<AuthoriseTotalLine>;
}): void {
  if (!input.lines.length) {
    throw new Error(`${input.documentLabel} has no lines`);
  }
  const lineNet = input.lines.reduce((s, l) => s + Number(l.net_minor), 0);
  const lineTax = input.lines.reduce((s, l) => s + Number(l.tax_minor), 0);
  const headerSub = Number(input.subtotalMinor);
  const headerTax = Number(input.taxMinor);
  const headerTotal = Number(input.totalMinor);
  if (lineNet !== headerSub || lineTax !== headerTax) {
    throw new Error(
      `${input.documentLabel} totals do not match its lines — re-save the draft before authorising`,
    );
  }
  if (headerTotal !== lineNet + lineTax) {
    throw new Error(
      `${input.documentLabel} total does not equal subtotal + tax — re-save the draft before authorising`,
    );
  }
  if (!(headerTotal > 0)) {
    throw new Error(`${input.documentLabel} total must be greater than zero`);
  }
}
