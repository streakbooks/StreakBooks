# CRM development progress

```
[###############] Campaigns persistence + prior CRM batches
```

**Reconciled:** 2026-11-09 against GitHub main (post #216) + campaigns branch and linked Supabase.

## Verified delivery

- Merged: #208–#216
- This branch: `crm_campaigns` table + `upsert_crm_campaign`; `/crm/campaigns` create/list; budgets labelled non-GL
- Supabase applied: `20261109120000`–`20261109170000` on `ipxflpzfcqwtenodbxwc`
- Unit tests: CRM suite including campaign-draft

## Gap closure report

- Critical remaining: outbound email provider, automation runners, live E2E 5/5 browser proof, hosted deploy proof, spam-protected public intake
- High remaining: import mapping backends, territory rule storage, multi-touch attribution
- Live E2E pack: contract automated; live proof unverified

## Batches

- Completed on main through public-forms gate + team/E2E pack
- Shipping: CRM-11 campaign records
- Next: live authenticated E2E, email provider when ready
