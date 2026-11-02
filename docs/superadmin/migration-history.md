# Migration history drift

Read on 2 November 2026. Remote data was not changed by this check.

| | Count |
| --- | --- |
| Remote history rows | 125 |
| Local migration files | 111 |
| Versions only on the remote | 62 |
| Versions only in the local folder | 47 |
| Remote rows with no stored SQL | 15 |

The 62 remote-only versions include dashboard applies whose names match local files with different timestamps. Example: remote `20261023103958` `ledger_write_path_hardening` and local `20261023170000_ledger_write_path_hardening.sql`. Copying the remote SQL into `supabase/migrations/` under the remote version would make a reset apply the same change twice.

`supabase migration repair` was not run. Marking those versions reverted would change the remote history table.

`supabase db push` still stops because those remote versions have no local file.

Docker is not installed on this machine, so a local `supabase db reset` was not run and the rebuilt schema was not diffed against the remote schema. That proof is outstanding.

The 15 remote rows with no stored SQL include the five November 2026 migrations. Their SQL is the local file, which is why the history row has no statement text.
