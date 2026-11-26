# Local development and partner access checks

## Prepare the app

From PowerShell in the Windows checkout:

```powershell
cd D:\StreakBooks
npm.cmd ci
npm.cmd run dev
```

Open `http://localhost:8080` and sign in with the local test accounts. Never copy production
credentials into a test fixture or commit a `.env` file.

## Run partner governance tests

```powershell
npm.cmd run test:firm-access:postgres
```

The test runs in a disposable PostgreSQL 17 Docker container with synthetic users and companies.
It does not connect to the hosted Supabase project.

## Manual test checklist

Use a dedicated test firm, two test staff accounts, and two test client companies.

1. As the firm owner, link Client A and Client B. Confirm no staff company-member rows are added
   and the client user limit is unchanged.
2. Grant Staff 1 access only to Client A and Staff 2 access only to Client B. Confirm each staff
   portfolio, client selector, and client module returns only that assigned client. Try a direct
   request for the other client and confirm denial.
3. As Staff 1, request transaction posting and bank-feed management for Client A. Confirm the
   firm owner cannot approve the request or grant the permissions to themselves. Approve one
   permission as Client A's authorized administrator and confirm only that permission becomes
   available.
4. Open Client A → Settings → Audit. Confirm the log shows staff name, module, and timestamp.
   Open another module as delegated staff and confirm that access event appears.
5. Suspend the firm. Confirm firm staff lose portfolio access immediately while the client can
   still view and export their own records. Restore the firm after this check.
6. Disconnect the firm as the client. Confirm the firm loses access immediately and the client's
   own view/export remains available. Review the existing firm practice metadata for retention
   handling; this migration does not delete it.
7. Change a subscription from client payer to firm payer after client consent. Confirm access
   continues throughout. Attempt the same change without consent and confirm it is rejected.
8. Configure partner tiers and compare the count with active subscriptions having a positive
   amount. Trials and clients without a company-member login in the last 120 days must not count.

Review the firm client switcher on desktop, tablet, and mobile, then keyboard through its controls.
For accessibility, check focus visibility, screen-reader labels, and table/header associations.

## Apply the pending migration

The migration is not applied to hosted Supabase. After reviewing and testing the branch, an
authorized operator can apply migrations through the team's normal Supabase deployment process.
Do not apply the migration while the hosted migration ledger has the unmatched
`20261124112655_streakbooks_report_worker_dispatch_url` version until its immutable source and
history are reconciled.
