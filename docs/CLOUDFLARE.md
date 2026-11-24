# StreakBooks — Cloudflare Pages (Workers SSR)

This app is **Vercel-first** (`NITRO_PRESET` default: `vercel`). Cloudflare is supported by switching the Nitro preset at **build time**.

## Why deploy failed (`index.mjs` not found)

Cloudflare was running **Wrangler** against `.output/server/wrangler.json` (Nitro’s generic Workers layout) **without** a Cloudflare preset build. This repo **overrides** Nitro to `vercel`, so a normal `npm run build` only produces `.vercel/output` — not `index.mjs` for Wrangler.

## Cloudflare Pages settings

| Setting | Value |
|---------|--------|
| **Framework preset** | None / Other |
| **Build command** | `npm ci && NITRO_PRESET=cloudflare_pages npm run build` |
| **Build output directory** | `dist` |
| **Root directory** | `/` (repo root) |
| **Node.js version** | 22 |

**Do not** set a custom deploy command to `wrangler deploy` unless you run the Cloudflare preset build first. For Pages, use **Connect to Git** with the build command above; Pages runs the worker from `dist/_worker.js/` automatically.

Equivalent env shorthand: `CF_PAGES=1 npm run build` (see `vite.config.ts`).

## Environment variables (dashboard)

Mirror [ENV_AND_DEPLOYMENT.md](./ENV_AND_DEPLOYMENT.md). Set the same server names (no `VITE_*` on secrets):

- `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (secret)
- `STREAKBOOKS_CRON_SECRET` (secret, if cron routes used)
- AI keys, email, payment providers as on Vercel

Supabase → Authentication → add your `*.pages.dev` and custom domain URLs.

## Local preview (after Cloudflare build)

```bash
NITRO_PRESET=cloudflare_pages npm run build
npx wrangler pages dev dist
```

## Vercel vs Cloudflare

| Host | Build | Output |
|------|-------|--------|
| Vercel (default) | `npm run build` | `.vercel/output` |
| Cloudflare Pages | `NITRO_PRESET=cloudflare_pages npm run build` | `dist/` + `dist/_worker.js/` |

Code uses `x-vercel-ip-country` in a few billing paths; on Cloudflare you may need `CF-IPCountry` — track as follow-up if you migrate production traffic off Vercel.