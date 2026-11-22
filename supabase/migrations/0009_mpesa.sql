-- M-PESA payments through Safaricom Daraja (C2B).
--
--  • mpesa_config: one row. The Daraja keys, passkey and the secret in the
--    callback address live in Supabase Vault; this table keeps only their ids.
--  • mpesa_callbacks: every confirmation exactly as Safaricom sent it, stored
--    before anything else happens, so a payment is never lost. One that fails
--    to process is tried again every 5 minutes (0010), up to 5 times.
--  • mpesa_transactions: one row per M-PESA receipt number. The receipt is
--    unique, so a callback sent twice can never credit an account twice.
--  • A matched payment becomes a 'money_in' ledger line against the school and
--    invoice, and the invoice's status follows what has been paid.
--  • Every received, matched, unmatched, review and reversed payment notifies
--    the people who can see that ledger: in the app's bell and as a push
--    notification through the existing reminder_jobs / send-reminders.

-- ---------------------------------------------------------------- settings
create table public.mpesa_config (
  id boolean primary key default true check (id),   -- only ever one row
  ledger_id text not null default 'bidii' references public.ledgers (id),
  enabled boolean not null default false,
  environment text not null default 'sandbox' check (environment in ('sandbox', 'production')),
  shortcode text,
  shortcode_type text not null default 'paybill' check (shortcode_type in ('paybill', 'till')),
  consumer_key_id uuid,                               -- Vault secret ids
  consumer_secret_id uuid,
  passkey_id uuid,
  callback_token_id uuid,
  status text not null default 'disconnected' check (status in ('connected', 'disconnected', 'error')),
  status_detail text,
  tested_at timestamptz,
  urls_registered_at timestamptz,
  last_sync_at timestamptz,                           -- last time Safaricom and the app reached each other
  updated_by uuid references public.people (id),
  updated_at timestamptz not null default now()
);
insert into public.mpesa_config default values;

-- ---------------------------------------------------------------- payments
create table public.mpesa_transactions (
  id uuid primary key default gen_random_uuid(),
  receipt text not null unique,                       -- M-PESA receipt number (TransID)
  ledger_id text not null references public.ledgers (id),
  transaction_type text,
  paid_at timestamptz not null,
  amount numeric not null,
  phone text,                                         -- as Safaricom sends it; may be masked or hashed
  payer_name text,
  account_ref text,                                   -- BillRefNumber: what the payer typed as the account
  shortcode text,
  org_balance numeric,
  third_party_id text,
  status text not null default 'received' check (status in ('received', 'matched', 'unmatched', 'review', 'reversed')),
  match_method text check (match_method in ('invoice', 'school', 'phone', 'manual')),
  school_id uuid references public.schools (id),
  invoice_id uuid references public.invoices (id),
  ledger_line_id uuid references public.ledger_lines (id),
  reversal_line_id uuid references public.ledger_lines (id),
  note text,
  callback_id bigint,
  reconciled_by uuid references public.people (id),
  reconciled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index mpesa_transactions_paid on public.mpesa_transactions (paid_at desc);
create index mpesa_transactions_status on public.mpesa_transactions (status);

create table public.mpesa_callbacks (
  id bigserial primary key,
  kind text not null default 'confirmation' check (kind in ('confirmation')),
  payload jsonb not null,
  source_ip text,
  received_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'processed', 'duplicate', 'failed')),
  attempts integer not null default 0,
  error text,
  transaction_id uuid references public.mpesa_transactions (id),
  processed_at timestamptz
);
create index mpesa_callbacks_open on public.mpesa_callbacks (received_at) where status in ('pending', 'failed');
alter table public.mpesa_transactions add constraint mpesa_transactions_callback
  foreign key (callback_id) references public.mpesa_callbacks (id);

-- ---------------------------------------------------------------- notifications
-- The bell reads the same notices that are pushed to devices. A notice is
-- marked read in the app; push sending (sent_at) is separate.
alter table public.reminder_jobs add column read_at timestamptz;
alter table public.reminder_jobs add column data jsonb;
alter table public.reminder_jobs drop constraint reminder_jobs_kind_check;
alter table public.reminder_jobs add constraint reminder_jobs_kind_check
  check (kind in ('event', 'task', 'task_given', 'notice', 'payment'));
create index reminder_jobs_bell on public.reminder_jobs (person_id, fire_at desc) where kind in ('notice', 'payment', 'task_given');

-- Mark some (or, with null, all) of your notifications read.
create or replace function public.mark_notifications_read(p_ids text[] default null)
returns integer language sql security definer set search_path = public as $$
  with done as (
    update reminder_jobs set read_at = now()
     where person_id = auth.uid() and read_at is null and fire_at <= now()
       and kind in ('notice', 'payment', 'task_given')
       and (p_ids is null or id = any (p_ids))
    returning 1
  )
  select count(*)::integer from done;
$$;

-- ---------------------------------------------------------------- helpers
create or replace function public.mpesa_kes(n numeric) returns text
language sql immutable as $$
  select 'KES ' || to_char(round(coalesce(n, 0)), 'FM999,999,999,990');
$$;

-- 0712 345 678, +254712345678 and 712345678 all become 254712345678.
create or replace function public.mpesa_phone(p text) returns text
language sql immutable as $$
  select case
           when d ~ '^254[17][0-9]{8}$' then d
           when d ~ '^0[17][0-9]{8}$' then '254' || substr(d, 2)
           when d ~ '^[17][0-9]{8}$' then '254' || d
         end
    from (select regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g') as d) x;
$$;

-- Stores a value in Vault, replacing the old one if there is one.
create or replace function public.mpesa_put_secret(p_id uuid, p_name text, p_value text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := p_id;
begin
  if v_id is null or not exists (select 1 from vault.secrets where id = v_id) then
    select id into v_id from vault.secrets where name = p_name;
  end if;
  if v_id is not null then
    perform vault.update_secret(v_id, p_value);
    return v_id;
  end if;
  return vault.create_secret(p_value, p_name);
end $$;

-- Tell everyone who can see the ledger (not the person who did it).
create or replace function public.mpesa_notify(p_ledger text, p_key text, p_title text, p_body text, p_url text, p_data jsonb)
returns void language sql security definer set search_path = public as $$
  insert into reminder_jobs (person_id, id, kind, source_id, fire_at, title, body, url, data)
  select p.id, p_key, 'payment', coalesce(p_data->>'transactionId', p_key), now(), p_title, left(p_body, 300), p_url, p_data
    from people p
   where p.active and p.id is distinct from auth.uid()
     and (p.is_owner or exists (select 1 from memberships m where m.person_id = p.id
                                 and (m.ledger_id = p_ledger or m.role = 'td_cofounder')))
  on conflict (person_id, id) do nothing;
$$;

-- An invoice is paid, part paid or open according to the lines against it.
create or replace function public.mpesa_refresh_invoice(p_invoice uuid)
returns void language sql security definer set search_path = public as $$
  update invoices i
     set status = case when x.paid >= i.amount - 0.5 then 'paid' when x.paid > 0 then 'part_paid' else 'open' end
    from (select coalesce(sum(amount), 0) as paid from ledger_lines where invoice_id = p_invoice) x
   where i.id = p_invoice and i.status in ('open', 'part_paid', 'paid');
$$;

-- The money-in line for a payment, already matched to the bank (M-PESA).
create or replace function public.mpesa_credit(p_tx public.mpesa_transactions, p_school uuid, p_invoice uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_line uuid;
  v_number text;
begin
  select number into v_number from invoices where id = p_invoice;
  insert into ledger_lines (ledger_id, occurred_on, type, amount, school_id, invoice_id, description, status, created_by)
  values (p_tx.ledger_id, (p_tx.paid_at at time zone 'Africa/Nairobi')::date, 'money_in', p_tx.amount, p_school, p_invoice,
          'M-PESA ' || p_tx.receipt || coalesce(' from ' || nullif(p_tx.payer_name, ''), '') || coalesce(', invoice ' || v_number, ''),
          'reconciled', auth.uid())
  returning id into v_line;
  return v_line;
end $$;

-- ---------------------------------------------------------------- matching
-- In order: the account number is an invoice number; the account number is
-- the school's Bidii id (then its oldest unpaid invoice); the payer's phone is
-- one school's contact phone (also when Safaricom sends it hashed). A payment
-- that matches is credited only if it is not more than the invoice still owes.
create or replace function public.mpesa_find_match(p_ledger text, p_ref text, p_phone text, p_amount numeric,
  out o_school uuid, out o_invoice uuid, out o_method text, out o_status text, out o_note text)
language plpgsql stable security definer set search_path = public as $$
declare
  v_ref text := upper(regexp_replace(coalesce(p_ref, ''), '\s', '', 'g'));
  v_inv invoices;
  v_school uuid;
  v_count integer;
  v_owed numeric;
begin
  if v_ref <> '' then
    select * into v_inv from invoices i
     where i.ledger_id = p_ledger and upper(regexp_replace(i.number, '\s', '', 'g')) = v_ref;
    if v_inv.id is not null then
      o_school := v_inv.school_id;
      o_method := 'invoice';
      if v_inv.status not in ('open', 'part_paid') then
        o_invoice := v_inv.id;
        o_status := 'review';
        o_note := 'Invoice ' || v_inv.number || ' is already ' || replace(v_inv.status, '_', ' ') || '.';
        return;
      end if;
    else
      select s.id into v_school from schools s where s.ledger_id = p_ledger and upper(s.bidii_school_id) = v_ref;
      if v_school is not null then
        o_school := v_school;
        o_method := 'school';
      end if;
    end if;
  end if;

  if o_school is null and coalesce(p_phone, '') <> '' then
    select count(*), min(s.id::text)::uuid into v_count, v_school
      from schools s
     where s.ledger_id = p_ledger and s.contact_phone is not null
       and (mpesa_phone(s.contact_phone) = mpesa_phone(p_phone)
            or (p_phone ~* '^[0-9a-f]{64}$'
                and encode(sha256(convert_to(mpesa_phone(s.contact_phone), 'UTF8')), 'hex') = lower(p_phone)));
    if v_count = 1 then
      o_school := v_school;
      o_method := 'phone';
    elsif v_count > 1 then
      o_status := 'review';
      o_note := 'The phone number belongs to ' || v_count || ' schools.';
      return;
    end if;
  end if;

  if o_school is null then
    o_status := 'unmatched';
    o_note := case when v_ref = '' then 'No account number was given, and the phone number is not a school''s.'
                   else 'Account number ' || trim(p_ref) || ' is not an invoice or a school.' end;
    return;
  end if;

  if v_inv.id is null then
    select * into v_inv from invoices i
     where i.school_id = o_school and i.status in ('open', 'part_paid')
     order by i.due_on, i.issued_on
     limit 1;
    if v_inv.id is null then
      o_status := 'review';
      o_note := 'The school has no invoice waiting to be paid.';
      return;
    end if;
  end if;

  o_invoice := v_inv.id;
  select v_inv.amount - coalesce(sum(l.amount), 0) into v_owed from ledger_lines l where l.invoice_id = v_inv.id;
  if p_amount > v_owed + 0.5 then
    o_status := 'review';
    o_note := 'Paid ' || mpesa_kes(p_amount) || ' but invoice ' || v_inv.number || ' owes ' || mpesa_kes(v_owed) || '.';
    return;
  end if;
  o_status := 'matched';
end $$;

-- ---------------------------------------------------------------- processing
-- Turns one stored confirmation into a payment. Safe to run again: a callback
-- already done is skipped, and a receipt already recorded is never credited
-- a second time.
create or replace function public.mpesa_process_callback(p_id bigint)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_cb mpesa_callbacks;
  v_cfg mpesa_config;
  v_p jsonb;
  v_tx mpesa_transactions;
  v_m record;
  v_receipt text;
  v_amount numeric;
  v_time text;
  v_paid timestamptz;
  v_flags text[] := '{}';
  v_line uuid;
begin
  select * into v_cb from mpesa_callbacks where id = p_id for update;
  if v_cb.id is null then
    raise exception 'Callback % not found.', p_id;
  end if;
  if v_cb.status in ('processed', 'duplicate') then
    return v_cb.transaction_id;
  end if;
  select * into v_cfg from mpesa_config;
  v_p := v_cb.payload;

  v_receipt := upper(trim(v_p->>'TransID'));
  if v_receipt is null or v_receipt !~ '^[A-Z0-9]{6,20}$' then
    raise exception 'The callback has no valid M-PESA receipt number (TransID).';
  end if;
  begin
    v_amount := (v_p->>'TransAmount')::numeric;
  exception when others then
    v_amount := null;
  end;
  if v_amount is null then
    raise exception 'The callback has no valid amount (TransAmount).';
  end if;

  -- TransTime is YYYYMMDDHHmmss, Nairobi time.
  v_time := v_p->>'TransTime';
  begin
    v_paid := make_timestamp(substr(v_time, 1, 4)::int, substr(v_time, 5, 2)::int, substr(v_time, 7, 2)::int,
                             substr(v_time, 9, 2)::int, substr(v_time, 11, 2)::int, substr(v_time, 13, 2)::double precision)
              at time zone 'Africa/Nairobi';
  exception when others then
    v_paid := v_cb.received_at;
  end;

  -- Anything odd is held for a person to look at instead of being credited.
  if v_amount <= 0 then
    v_flags := array_append(v_flags, 'The amount is zero or less.');
  end if;
  if v_cfg.shortcode is not null and coalesce(v_p->>'BusinessShortCode', '') <> v_cfg.shortcode then
    v_flags := array_append(v_flags, 'Paid to shortcode ' || coalesce(v_p->>'BusinessShortCode', 'none') || ', not ' || v_cfg.shortcode || '.');
  end if;
  if not v_cfg.enabled then
    v_flags := array_append(v_flags, 'Received while the M-PESA integration was switched off.');
  end if;

  if cardinality(v_flags) > 0 then
    select null::uuid as o_school, null::uuid as o_invoice, null::text as o_method, 'review'::text as o_status,
           array_to_string(v_flags, ' ') as o_note into v_m;
  else
    select * into v_m from mpesa_find_match(v_cfg.ledger_id, v_p->>'BillRefNumber', v_p->>'MSISDN', v_amount);
  end if;

  insert into mpesa_transactions (receipt, ledger_id, transaction_type, paid_at, amount, phone, payer_name, account_ref,
                                  shortcode, org_balance, third_party_id, status, match_method, school_id, invoice_id,
                                  note, callback_id, reconciled_at)
  values (v_receipt, v_cfg.ledger_id, v_p->>'TransactionType', v_paid, v_amount, nullif(trim(v_p->>'MSISDN'), ''),
          nullif(trim(concat_ws(' ', nullif(trim(v_p->>'FirstName'), ''), nullif(trim(v_p->>'MiddleName'), ''), nullif(trim(v_p->>'LastName'), ''))), ''),
          nullif(trim(v_p->>'BillRefNumber'), ''), v_p->>'BusinessShortCode',
          case when v_p->>'OrgAccountBalance' ~ '^-?[0-9]+(\.[0-9]+)?$' then (v_p->>'OrgAccountBalance')::numeric end,
          nullif(v_p->>'ThirdPartyTransID', ''), v_m.o_status, v_m.o_method, v_m.o_school,
          v_m.o_invoice,
          v_m.o_note, p_id, case when v_m.o_status = 'matched' then now() end)
  on conflict (receipt) do nothing
  returning * into v_tx;

  if v_tx.id is null then
    -- Already recorded from an earlier callback: nothing more is credited.
    select * into v_tx from mpesa_transactions where receipt = v_receipt;
    update mpesa_callbacks set status = 'duplicate', transaction_id = v_tx.id, attempts = attempts + 1, error = null, processed_at = now()
     where id = p_id;
    insert into audit_log (actor_id, action, subject_type, subject_id, details)
    values (null, 'mpesa_duplicate_ignored', 'mpesa_transaction', v_tx.id::text, jsonb_build_object('receipt', v_receipt, 'callback', p_id));
    return v_tx.id;
  end if;

  if v_tx.status = 'matched' then
    v_line := mpesa_credit(v_tx, v_tx.school_id, v_tx.invoice_id);
    update mpesa_transactions set ledger_line_id = v_line where id = v_tx.id;
    if v_tx.invoice_id is not null then
      perform mpesa_refresh_invoice(v_tx.invoice_id);
    end if;
  end if;

  insert into audit_log (actor_id, action, subject_type, subject_id, details)
  values (null, 'mpesa_received', 'mpesa_transaction', v_tx.id::text,
          jsonb_build_object('receipt', v_receipt, 'amount', v_amount, 'status', v_tx.status, 'method', v_tx.match_method,
                             'invoice', v_tx.invoice_id, 'ledgerLine', v_line, 'note', v_tx.note, 'callback', p_id));
  update mpesa_callbacks set status = 'processed', transaction_id = v_tx.id, attempts = attempts + 1, error = null, processed_at = now()
   where id = p_id;
  update mpesa_config set last_sync_at = now() where id;
  return v_tx.id;
end $$;

-- Processes a callback; if that fails, keeps it as failed (to try again) and
-- tells people the first time.
create or replace function public.mpesa_try_callback(p_id bigint)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_err text;
  v_attempts integer;
  v_ledger text;
begin
  begin
    perform mpesa_process_callback(p_id);
    return true;
  exception when others then
    v_err := sqlerrm;
  end;
  update mpesa_callbacks set status = 'failed', attempts = attempts + 1, error = left(v_err, 500)
   where id = p_id
  returning attempts into v_attempts;
  if v_attempts = 1 then
    select ledger_id into v_ledger from mpesa_config;
    perform mpesa_notify(v_ledger, 'mpesa-callback:' || p_id, 'M-PESA callback failed', left(v_err, 200), '/payments?status=failed',
                         jsonb_build_object('callbackId', p_id, 'status', 'failed'));
  end if;
  return false;
end $$;

-- Called by the callback route with the secret from its address. Stores the
-- confirmation first, then processes it.
create or replace function public.mpesa_receive(p_token text, p_payload jsonb, p_ip text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_token text;
  v_id bigint;
begin
  select d.decrypted_secret into v_token
    from mpesa_config c join vault.decrypted_secrets d on d.id = c.callback_token_id;
  if v_token is null or p_token is distinct from v_token then
    return 'rejected';
  end if;
  insert into mpesa_callbacks (payload, source_ip) values (coalesce(p_payload, '{}'::jsonb), left(p_ip, 100))
  returning id into v_id;
  perform mpesa_try_callback(v_id);
  return 'accepted';
end $$;

-- Checks the secret for the validation address (nothing is stored).
create or replace function public.mpesa_check_token(p_token text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from mpesa_config c join vault.decrypted_secrets d on d.id = c.callback_token_id
                  where d.decrypted_secret = p_token);
$$;

-- Every 5 minutes (0010): callbacks that failed, or were stored but never
-- processed, are tried again, up to 5 times within 3 days.
create or replace function public.mpesa_retry_callbacks()
returns integer language plpgsql security definer set search_path = public as $$
declare
  r record;
  n integer := 0;
begin
  for r in select id from mpesa_callbacks
            where attempts < 5 and received_at > now() - interval '3 days'
              and (status = 'failed' or (status = 'pending' and received_at < now() - interval '1 minute'))
            order by id limit 100 loop
    if mpesa_try_callback(r.id) then n := n + 1; end if;
  end loop;
  return n;
end $$;

-- "Try again" on a failed callback, by someone who can edit the ledger.
create or replace function public.mpesa_retry_callback(p_id bigint)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not has_permission((select ledger_id from mpesa_config), 'ledger_editor') then
    raise exception 'Only people who can edit the ledger can retry payments.';
  end if;
  if not exists (select 1 from mpesa_callbacks where id = p_id and status in ('pending', 'failed')) then
    raise exception 'This callback has already been processed.';
  end if;
  return mpesa_try_callback(p_id);
end $$;

-- ---------------------------------------------------------------- notices
create or replace function public.mpesa_transaction_notice() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_who text;
  v_title text;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;
  if new.status = 'received' then
    return new;
  end if;
  select name into v_who from schools where id = new.school_id;
  v_who := coalesce(v_who, new.payer_name, new.phone, 'an unknown payer');
  v_title := case new.status
               when 'matched' then case when tg_op = 'INSERT' then 'M-PESA payment received and reconciled' else 'M-PESA payment reconciled' end
               when 'unmatched' then 'M-PESA payment received, not matched'
               when 'review' then 'M-PESA payment needs review'
               when 'reversed' then 'M-PESA payment reversed'
             end;
  perform mpesa_notify(
    new.ledger_id,
    'mpesa:' || new.id || ':' || new.status || ':' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
    v_title,
    mpesa_kes(new.amount) || ' from ' || v_who || ' · ' || new.receipt || ' · '
      || to_char(new.paid_at at time zone 'Africa/Nairobi', 'DD Mon HH24:MI') || coalesce(' · ' || new.note, ''),
    '/payments/' || new.id,
    jsonb_build_object('transactionId', new.id, 'receipt', new.receipt, 'amount', new.amount, 'payer', v_who,
                       'phone', new.phone, 'paidAt', new.paid_at, 'status', new.status));
  return new;
end $$;

create trigger mpesa_transactions_notice after insert or update of status on public.mpesa_transactions
for each row execute function public.mpesa_transaction_notice();

-- ---------------------------------------------------------------- by people
-- Match a payment by hand: to an invoice, to a school, or as other money in.
create or replace function public.mpesa_reconcile(p_tx uuid, p_invoice uuid, p_school uuid, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_tx mpesa_transactions;
  v_inv invoices;
  v_school uuid := p_school;
  v_line uuid;
begin
  select * into v_tx from mpesa_transactions where id = p_tx for update;
  if v_tx.id is null then
    raise exception 'Payment not found.';
  end if;
  if not has_permission(v_tx.ledger_id, 'ledger_editor') then
    raise exception 'Only people who can edit the ledger can reconcile payments.';
  end if;
  if v_tx.status not in ('unmatched', 'review') then
    raise exception 'This payment is already %.', case v_tx.status when 'matched' then 'reconciled' else v_tx.status end;
  end if;
  if coalesce(trim(p_note), '') = '' then
    raise exception 'Give a reason for the match.';
  end if;
  if v_tx.amount <= 0 then
    raise exception 'A payment of zero or less cannot be credited.';
  end if;
  if p_invoice is not null then
    select * into v_inv from invoices where id = p_invoice and ledger_id = v_tx.ledger_id for update;
    if v_inv.id is null then
      raise exception 'Invoice not found.';
    end if;
    if v_inv.status not in ('open', 'part_paid') then
      raise exception 'Invoice % is already %.', v_inv.number, replace(v_inv.status, '_', ' ');
    end if;
    v_school := v_inv.school_id;
  elsif v_school is not null and not exists (select 1 from schools where id = v_school and ledger_id = v_tx.ledger_id) then
    raise exception 'School not found.';
  end if;

  v_line := mpesa_credit(v_tx, v_school, p_invoice);
  update mpesa_transactions
     set status = 'matched', match_method = 'manual', school_id = v_school, invoice_id = p_invoice, ledger_line_id = v_line,
         note = trim(p_note), reconciled_by = auth.uid(), reconciled_at = now(), updated_at = now()
   where id = p_tx;
  if p_invoice is not null then
    perform mpesa_refresh_invoice(p_invoice);
  end if;
  insert into audit_log (actor_id, action, subject_type, subject_id, details)
  values (auth.uid(), 'mpesa_reconciled', 'mpesa_transaction', p_tx::text,
          jsonb_build_object('receipt', v_tx.receipt, 'from', v_tx.status, 'invoice', p_invoice, 'school', v_school, 'ledgerLine', v_line, 'note', trim(p_note)));
end $$;

-- Record that a payment was reversed (refunded through M-PESA). If it was
-- credited, a refund line takes it back off the invoice; nothing is deleted.
create or replace function public.mpesa_reverse(p_tx uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_tx mpesa_transactions;
  v_line uuid;
begin
  select * into v_tx from mpesa_transactions where id = p_tx for update;
  if v_tx.id is null then
    raise exception 'Payment not found.';
  end if;
  if not has_permission(v_tx.ledger_id, 'ledger_editor') then
    raise exception 'Only people who can edit the ledger can reverse payments.';
  end if;
  if v_tx.status = 'reversed' then
    raise exception 'This payment is already reversed.';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Give a reason for the reversal.';
  end if;
  if v_tx.ledger_line_id is not null then
    insert into ledger_lines (ledger_id, occurred_on, type, amount, school_id, invoice_id, description, status, created_by)
    values (v_tx.ledger_id, (now() at time zone 'Africa/Nairobi')::date, 'refund', -v_tx.amount, v_tx.school_id, v_tx.invoice_id,
            'Reversal of M-PESA ' || v_tx.receipt || ': ' || trim(p_reason), 'reconciled', auth.uid())
    returning id into v_line;
    if v_tx.invoice_id is not null then
      perform mpesa_refresh_invoice(v_tx.invoice_id);
    end if;
  end if;
  update mpesa_transactions
     set status = 'reversed', reversal_line_id = v_line, note = trim(p_reason), updated_at = now()
   where id = p_tx;
  insert into audit_log (actor_id, action, subject_type, subject_id, details)
  values (auth.uid(), 'mpesa_reversed', 'mpesa_transaction', p_tx::text,
          jsonb_build_object('receipt', v_tx.receipt, 'from', v_tx.status, 'refundLine', v_line, 'reason', trim(p_reason)));
end $$;

-- ---------------------------------------------------------------- settings
-- Save the integration settings. A key left blank keeps the one saved. The
-- secret in the callback address is made the first time.
create or replace function public.mpesa_save_config(p_enabled boolean, p_environment text, p_shortcode text, p_shortcode_type text,
  p_consumer_key text, p_consumer_secret text, p_passkey text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_cfg mpesa_config;
  v_key text := nullif(trim(coalesce(p_consumer_key, '')), '');
  v_secret text := nullif(trim(coalesce(p_consumer_secret, '')), '');
  v_passkey text := nullif(trim(coalesce(p_passkey, '')), '');
  v_shortcode text := nullif(trim(coalesce(p_shortcode, '')), '');
  v_moved boolean;
begin
  select * into v_cfg from mpesa_config for update;
  if not has_permission(v_cfg.ledger_id, 'settings_editor') then
    raise exception 'Only the owner, or someone the owner allows, can change Settings.';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Give a reason for the change.';
  end if;
  if p_environment not in ('sandbox', 'production') then
    raise exception 'Choose Sandbox or Production.';
  end if;
  if p_shortcode_type not in ('paybill', 'till') then
    raise exception 'Choose Paybill or Till.';
  end if;
  if v_shortcode is not null and v_shortcode !~ '^[0-9]{5,7}$' then
    raise exception 'The shortcode is the 5 to 7 digit Paybill or Till number.';
  end if;
  if p_enabled and (v_shortcode is null
                    or coalesce(v_key, (select 'x' where v_cfg.consumer_key_id is not null)) is null
                    or coalesce(v_secret, (select 'x' where v_cfg.consumer_secret_id is not null)) is null) then
    raise exception 'Add the shortcode, Consumer Key and Consumer Secret before switching M-PESA on.';
  end if;

  v_moved := v_cfg.environment is distinct from p_environment or v_cfg.shortcode is distinct from v_shortcode;
  update mpesa_config set
    enabled = p_enabled,
    environment = p_environment,
    shortcode = v_shortcode,
    shortcode_type = p_shortcode_type,
    consumer_key_id = case when v_key is null then consumer_key_id else mpesa_put_secret(consumer_key_id, 'mpesa_consumer_key', v_key) end,
    consumer_secret_id = case when v_secret is null then consumer_secret_id else mpesa_put_secret(consumer_secret_id, 'mpesa_consumer_secret', v_secret) end,
    passkey_id = case when v_passkey is null then passkey_id else mpesa_put_secret(passkey_id, 'mpesa_passkey', v_passkey) end,
    callback_token_id = case when callback_token_id is not null then callback_token_id
                             else mpesa_put_secret(null, 'mpesa_callback_token', replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')) end,
    status = case when v_moved or v_key is not null or v_secret is not null then 'disconnected' else status end,
    status_detail = case when v_moved or v_key is not null or v_secret is not null then 'Settings changed: test the connection again.' else status_detail end,
    urls_registered_at = case when v_moved then null else urls_registered_at end,
    updated_by = auth.uid(),
    updated_at = now()
  where id;

  -- The audit trail says what changed, never the keys themselves.
  insert into audit_log (actor_id, action, subject_type, subject_id, details)
  values (auth.uid(), 'mpesa_settings_changed', 'mpesa_config', 'mpesa',
          jsonb_build_object('enabled', p_enabled, 'environment', p_environment, 'shortcode', v_shortcode, 'shortcodeType', p_shortcode_type,
                             'newConsumerKey', v_key is not null, 'newConsumerSecret', v_secret is not null, 'newPasskey', v_passkey is not null,
                             'reason', trim(p_reason)));
end $$;

-- For the server only (service role): the keys, to call Daraja.
create or replace function public.mpesa_credentials()
returns table (ledger_id text, enabled boolean, environment text, shortcode text, shortcode_type text,
               consumer_key text, consumer_secret text, passkey text, callback_token text)
language sql stable security definer set search_path = public as $$
  select c.ledger_id, c.enabled, c.environment, c.shortcode, c.shortcode_type,
         (select decrypted_secret from vault.decrypted_secrets where id = c.consumer_key_id),
         (select decrypted_secret from vault.decrypted_secrets where id = c.consumer_secret_id),
         (select decrypted_secret from vault.decrypted_secrets where id = c.passkey_id),
         (select decrypted_secret from vault.decrypted_secrets where id = c.callback_token_id)
    from mpesa_config c;
$$;

-- For the server only: the result of testing the connection or registering
-- the callback addresses, after it has checked the person may do so.
create or replace function public.mpesa_set_status(p_actor uuid, p_action text, p_ok boolean, p_detail text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update mpesa_config set
    status = case when p_ok then 'connected' else 'error' end,
    status_detail = left(p_detail, 500),
    tested_at = now(),
    urls_registered_at = case when p_ok and p_action = 'registered' then now() else urls_registered_at end,
    last_sync_at = case when p_ok then now() else last_sync_at end
  where id;
  insert into audit_log (actor_id, action, subject_type, subject_id, details)
  values (p_actor, 'mpesa_' || p_action, 'mpesa_config', 'mpesa', jsonb_build_object('ok', p_ok, 'detail', left(p_detail, 500)));
end $$;

-- ---------------------------------------------------------------- row level security
alter table public.mpesa_config enable row level security;
alter table public.mpesa_transactions enable row level security;
alter table public.mpesa_callbacks enable row level security;

create policy mpesa_config_read on public.mpesa_config for select to authenticated
  using (public.has_permission(ledger_id, 'settings_editor'));
create policy mpesa_transactions_read on public.mpesa_transactions for select to authenticated
  using (public.can_see_ledger(ledger_id));
-- The ledger M-PESA pays into (mpesa_config itself is only for settings editors).
create or replace function public.mpesa_ledger() returns text
language sql stable security definer set search_path = public as $$
  select ledger_id from mpesa_config;
$$;
create policy mpesa_callbacks_read on public.mpesa_callbacks for select to authenticated
  using (public.can_see_ledger(public.mpesa_ledger()));
-- The audit trail of a payment is shown with the payment.
create policy audit_read_mpesa on public.audit_log for select to authenticated
  using (subject_type = 'mpesa_transaction' and public.can_see_ledger(public.mpesa_ledger()));
-- All writes go through the functions above.

revoke delete on public.mpesa_config, public.mpesa_transactions, public.mpesa_callbacks from anon, authenticated;

revoke execute on function public.mpesa_put_secret(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.mpesa_notify(text, text, text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.mpesa_refresh_invoice(uuid) from public, anon, authenticated;
revoke execute on function public.mpesa_credit(public.mpesa_transactions, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.mpesa_find_match(text, text, text, numeric) from public, anon, authenticated;
revoke execute on function public.mpesa_process_callback(bigint) from public, anon, authenticated;
revoke execute on function public.mpesa_try_callback(bigint) from public, anon, authenticated;
revoke execute on function public.mpesa_receive(text, jsonb, text) from public, anon, authenticated;
revoke execute on function public.mpesa_check_token(text) from public, anon, authenticated;
revoke execute on function public.mpesa_retry_callbacks() from public, anon, authenticated;
revoke execute on function public.mpesa_credentials() from public, anon, authenticated;
revoke execute on function public.mpesa_set_status(uuid, text, boolean, text) from public, anon, authenticated;
revoke execute on function public.mpesa_save_config(boolean, text, text, text, text, text, text, text) from anon;
revoke execute on function public.mpesa_reconcile(uuid, uuid, uuid, text) from anon;
revoke execute on function public.mpesa_reverse(uuid, text) from anon;
revoke execute on function public.mpesa_retry_callback(bigint) from anon;
revoke execute on function public.mark_notifications_read(text[]) from anon;
