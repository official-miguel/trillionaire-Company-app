# trillionaire-Company-app

An app that helps govern Trillionaire Designs: ledgers for every shilling, pay
and approvals for Bidii and future products, and a calendar for everyday
planning that works offline and can be installed from the browser.

## What it does

- **Money**: a ledger per product and one for the company; nothing is ever
  deleted, and every change keeps the old value, who made it and why.
- **Month-end**: splits Bidii's leftover into the team pool, owners' payout,
  Trillionaire Designs fee, growth, product and reserve, as the shareholders'
  agreements set out.
- **Requests and approvals**: anyone asks for money; approvers approve by
  permission, and nobody approves their own request.
- **Schools, invoices and commission**: invoices follow each school's package
  from the Bidii Pricing Guide; commission is 3% (team) or 5% (outside
  referrers) of what a school pays in its first year.
- **Calendar**: type events the way you say them, plan tasks into free time,
  give tasks to people, works offline, installable, with push reminders.
- **Roles**: each person sees only the companies they are in.

## Stack

Next.js 15, Tailwind CSS 4, Supabase (Postgres with row level security,
Auth, Edge Functions, pg_cron), Vitest.

## Running it

```bash
npm install
npm run dev:demo        # sample data, no database needed (port 3100)
npm run dev             # real data from Supabase
npm test                # money rules, calendar, reminders and security
```

Secrets live in `.env.local` and `supabase/functions/.env`, which git
ignores. Never commit them.

## Setting up Supabase

```bash
npm run migrate                                  # needs SUPABASE_DB_URL in .env.local
npm run create-owner -- --name "Full Name" --email you@example.com --password "Temporary1"
npx supabase login
npx supabase secrets set --env-file supabase/functions/.env
npx supabase functions deploy send-reminders --no-verify-jwt
```
