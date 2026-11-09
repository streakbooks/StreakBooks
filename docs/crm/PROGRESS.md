# CRM development progress

```
[################] Territories persistence + campaigns + prior batches
```

**Reconciled:** 2026-11-09 against GitHub main (post #217) + territories branch and linked Supabase.

## Verified delivery

- Merged: #208–#217
- This branch: `crm_territories` + `upsert_crm_territory`; `/crm/team` create/list territories with optional owner
- Supabase applied: `20261109120000`–`20261109180000` on `ipxflpzfcqwtenodbxwc`
- Unit tests: CRM suite including territory-draft

## Gap closure report

- Critical remaining: outbound email provider, automation runners, live E2E 5/5 browser proof, hosted deploy proof, spam-protected public intake
- High remaining: import mapping backends, automatic territory routing rules, multi-touch attribution
- Live E2E pack: contract automated; live proof unverified

## Batches

- Completed through campaigns (#217)
- Merged: CRM-12 territory records (#218)
- Shipping: CRM products bridge (shared catalogue read-only)
- Next: live authenticated E2E, email provider when ready
