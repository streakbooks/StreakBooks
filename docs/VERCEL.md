# Vercel deploy (public URL for friend testing)

## Production URL
https://streakbooks-navy.vercel.app

## Redeploy
```bash
cd /Users/rohitm/paxaris-repos/StreakBooks
vercel --prod
```

## Supabase Auth URLs (required for signup/login on Vercel)
Dashboard → Authentication → URL Configuration:
- Site URL: `https://streakbooks-navy.vercel.app`
- Redirect URLs include:
  - `https://streakbooks-navy.vercel.app/**`
  - `http://127.0.0.1:5173/**`
  - `http://localhost:5173/**`
