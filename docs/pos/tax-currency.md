# Country and currency matrix

| Country     | Currency         | Required tax scenarios                                                             | Verification  |
| ----------- | ---------------- | ---------------------------------------------------------------------------------- | ------------- |
| USA         | USD (2 decimals) | State/local, sourcing, exemption evidence                                          | Not performed |
| UK          | GBP (2)          | Inclusive/exclusive, standard/reduced/zero, VAT documentation                      | Not performed |
| Australia   | AUD (2)          | GST, tax invoices, adjustment notes                                                | Not performed |
| New Zealand | NZD (2)          | GST, taxable supply information and adjustments                                    | Not performed |
| Canada      | CAD (2)          | GST/HST/PST/QST and compound/jurisdiction cases                                    | Not performed |
| India       | INR (2)          | CGST/SGST/IGST/cess, HSN/SAC, supply place, B2B/B2C, credit notes, IRN eligibility | Not performed |

Preview uses existing scalar catalogue rate and company inclusive/exclusive setting only. It is not a jurisdiction tax adapter and is not a compliant fiscal invoice. No current statutory rates, thresholds or exemptions were newly implemented or claimed verified. Official IRS/state, HMRC, ATO, NZ IRD, CRA/provincial and CBIC/GSTN rules must be checked before implementing each adapter; use effective dates and versioned fixtures.

Reuse existing money precision helpers; API amounts are decimal strings of minor units. Tests also cover JPY/KWD representation, without implying country support. Separate currency arithmetic from jurisdiction compliance.
