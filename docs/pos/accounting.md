# Accounting posting specification

Batch 1 posts nothing. Existing owner is `postJournal` / database `post_journal`; source/period/FX rules stay there.

| Event                  | Debit                                    | Credit                     | Required evidence                                                   |
| ---------------------- | ---------------------------------------- | -------------------------- | ------------------------------------------------------------------- |
| Cash sale 100 + 10 tax | Cash 110                                 | Revenue 100; output tax 10 | Persisted sale, line tax, cash payment, unique origin journal       |
| External card sale     | Card clearing gross                      | Revenue net; output tax    | Verified tender state and external reference, not settlement claim  |
| Customer credit sale   | Existing AR flow                         | Existing Sales revenue/tax | Exactly one revenue-producing source                                |
| Stock sale costing 60  | COGS 60                                  | Inventory 60               | Verified stock movement/cost layer; disabled until implemented      |
| Staff tips             | Cash/clearing                            | Tips payable               | Separate liability mapping and payout history                       |
| Gift card issuance     | Cash/clearing                            | Gift card liability        | Instrument ledger and issuer rules, no immediate revenue            |
| Processor settlement   | Bank net; fees; explicit difference      | Processor clearing gross   | Provider batch and allocation reconciliation                        |
| Refund                 | Applicable original revenue/tax reversal | Cash/clearing/liability    | Original item/payment origin, approved quantities, reversal linkage |

Mappings proposed: retail/service revenue, output tax by code, cash, card/provider clearing, AR, inventory, COGS, over/short, tips payable, gift card/store-credit liabilities, fees, FX and refund adjustments. Validate company, currency, active accounts and account type before allowing a register to trade.

Require period locks, controlled dates, dimensions and immutable journals. A unique economic event must not create duplicate revenue across invoices/POS. Posting errors must roll back an online cash sale or produce a durable visible exception for externally captured payments. Cash basis reporting uses existing allocation history. Till float/drop/transfer are asset transfers, not sales or expenses; paid-outs need explicit expense classification and authorization. Close reconciliation must distinguish change, refunds, cash drops, counted cash and independently pending card settlements.
