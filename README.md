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
- **M-PESA (Safaricom Daraja)**: payments to the Paybill or Till arrive by C2B
  callback, are matched to the invoice or school, credited to Bidii's ledger
  and shown in the notification bell. Anything that can't be matched waits on
  the M-PESA payments page for a person.

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

## M-PESA (Safaricom Daraja)

How a payment flows: Safaricom POSTs a C2B confirmation to
`/api/payments/c2b/<secret>/confirmation`. The app stores it as it came
(`mpesa_callbacks`), then records one payment per M-PESA receipt number
(`mpesa_transactions`, unique, so a repeat is never credited twice) and matches
it in this order:

1. the account number is an invoice number (`INV-1001`);
2. the account number is the school's Bidii id, then its oldest unpaid invoice;
3. the payer's phone is one school's contact phone (also when Safaricom sends
   it hashed).

A match that is not more than the invoice owes becomes a `money_in` ledger line
(status "Matched to bank") and the invoice moves to part paid or paid.
Overpayments, invoices already paid, a different shortcode, or a phone shared by
several schools are held as "Needs review"; no match is "Not matched". Both are
reconciled by hand on the payment's page by anyone with `ledger_editor`. A
callback that fails is tried again every 5 minutes, up to 5 times. Everyone who
can see Bidii is told in the bell (and by push, through `send-reminders`).

Set up:

```bash
npm run migrate            # applies 0010_mpesa.sql and 0011_mpesa_schedule.sql
```

Add to `.env.local` locally and to the Vercel project's environment variables:

| Variable | What it is |
| --- | --- |
| `APP_URL` | The app's public https address, e.g. `https://app.example.com`. Safaricom calls this back. |
| `DARAJA_ALLOWED_IPS` | Optional, recommended in production: comma-separated Safaricom callback addresses. Callers not listed are refused. Leave empty for the sandbox. |

Then in the app: **Settings → M-PESA / Daraja**, enter the shortcode,
Consumer Key and Consumer Secret, save, **Test connection**, **Register
callback addresses**. In the sandbox, **Send a test payment** with an invoice
number as the account number and watch it arrive under **M-PESA payments**.
The keys are stored in Supabase Vault and only the server reads them.

Going live: switch the environment to Production, enter the production
shortcode and keys from your Daraja production app, register the addresses
again, and set `DARAJA_ALLOWED_IPS` to the addresses Safaricom publishes for
callbacks. Safaricom lets production callback addresses be registered once
per shortcode; to change them later, ask Safaricom (apisupport@safaricom.co.ke).
Ask customers to type the invoice number as the account number.
