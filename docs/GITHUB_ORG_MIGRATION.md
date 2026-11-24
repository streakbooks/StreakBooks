# GitHub: migrate `streakbooks/StreakBooks` → `streakbooks`

## What you asked for

**Source of truth:** https://github.com/streakbooks/StreakBooks  
**Not** `streakbooks/StreakBooks` (personal fork — must not be treated as the migration source).

## Current state (2026-11-24)

| Item | Status |
|------|--------|
| Git `main` on `streakbooks/StreakBooks` | **Same commit** as LBA `main` (`81bb9f90…`) — code was pushed from `StreakBooks-LBA` |
| GitHub **repository transfer** of LBA | **Blocked** — `rohitmehra86` has **push** on LBA, not **admin** / not in the LBA org |
| `streakbooks/StreakBooks` repo record | Created by an earlier **personal** repo transfer; LBA **issues / PRs / Actions history** are still on `streakbooks/StreakBooks` |

So: **code** is aligned; **GitHub metadata** is not migrated until an LBA org owner transfers the repo.

## What an LBA org owner must do (official migration)

Someone with **admin** on `streakbooks/StreakBooks`:

1. Open **Settings → General → Danger Zone → Transfer ownership**  
   https://github.com/streakbooks/StreakBooks/settings  
2. New owner: organization **`streakbooks`**
3. Confirm the repository name (typically stays **`StreakBooks`** → `streakbooks/StreakBooks`)
4. Complete the transfer (org admins on `streakbooks` must accept if required)

After transfer, GitHub redirects `streakbooks/StreakBooks` → `streakbooks/StreakBooks` and keeps issues, PRs, and git history.

### Avoid two org repos

Today the org also has **`streakbooks/StreakBooks`** (from the mistaken personal transfer). After LBA transfer you may have:

- `streakbooks/StreakBooks` — **keep** (true migration)
- `streakbooks/StreakBooks` — **delete or archive** once `StreakBooks` is canonical (compare `main`; they should match)

Optional: rename `streakbooks/StreakBooks` → `StreakBooks` in **Settings → General** if you want the product name on the repo.

**Do not delete `StreakBooks` until LBA transfer succeeds and remotes are updated.**

## What `rohitmehra86` can do today

- Push code to `streakbooks/StreakBooks` via `StreakBooks-LBA` (already synced once)
- Admin the **`streakbooks`** org (accept incoming transfer, manage secrets, Lovable, Vercel)
- **Cannot** invoke GitHub’s transfer API on `streakbooks/StreakBooks` (returns 404)

## Local clones after LBA transfer

```bash
cd ~/Projects/StreakBooks-LBA
git remote set-url origin https://github.com/streakbooks/StreakBooks.git   # after transfer
git remote rename lba lba-archived   # optional; old URL redirects
git fetch origin
git pull origin main
```

## Integrations (after canonical repo is `streakbooks/StreakBooks`)

- Reconnect **Lovable** and **Vercel** to the transferred repo
- Copy **Actions / Dependabot secrets** from LBA (or re-enter in org repo settings)
- Update any docs that still say `git clone …/streakbooks/StreakBooks`

## Personal fork

`streakbooks/StreakBooks` no longer exists as a separate repo (it was moved into the org). Do not use it for migration planning; retire any clones still on the old fork history (`~/Projects/StreakBooks` at `a7fe70ea`).