# CRM development progress

```
[###########---] Foundation + quote bridge + pipelines + payment visibility
```

**Reconciled:** 2026-11-09 against GitHub main (post #208–#212) + CRM-09 branch and linked Supabase.

## Verified delivery

- Merged PRs: #208–#212 (foundation through pipeline admin)
- CRM-09 (this PR): `/crm/relationships` read-only Sales invoice/outstanding for quote-linked deals (`crm.view` + `sales.view`)
- Supabase applied: `20261109120000`–`20261109160000` on `ipxflpzfcqwtenodbxwc`
- Demo Company CRM enabled; browser smoke: Overview KPIs + Accounts list
- Unit tests: CRM suite including payment-visibility — see branch verification

## Gap closure report

- Requirements reviewed: **96+** (see competitor parity audit canvas)
- Critical remaining: outbound email, automation, public forms, formal live E2E 5/5, hosted deploy proof
- High remaining: CRM reports, import/export, advanced stage gates, retention workflows
- Live E2E pack: **Unverified** (smoke only)
- Originality: ORIGINALITY-CHECKLIST.md reviewed; legal pending

## Batches

- Completed / merged: CRM-01, CRM-02, CRM-04, CRM-03 partial, CRM-08, CRM-05
- Shipping: CRM-09 payment visibility (this branch)
- Next: formal E2E, CRM-07 email decision, CRM-11 reports
