-- Trillionaire Designs app, Phase 1: people and roles, ledgers with history,
-- pots and settings, periods, requests, schools, invoices, commissions,
-- statements. Visibility follows roles; nothing is ever deleted.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- people
create table public.people (
  id uuid primary key references auth.users (id) on delete restrict,
  slug text not null unique,                  -- 'miguel'; settings refer to people by slug
  full_name text not null,
  email text not null unique,
  phone text,
  share_class text check (share_class in ('A', 'B')),
  timezone text not null default 'Africa/Nairobi',
  must_change_password boolean not null default true,   -- set by an admin, cleared on first login
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Ledgers: one per product plus the company ledger.
create table public.ledgers (
  id text primary key,                       -- 'company', 'bidii', ...
  name text not null,
  kind text not null check (kind in ('company', 'product')),
  status text not null default 'active' check (status in ('draft', 'active', 'archived')),
  created_at timestamptz not null default now()
);

-- A role sets what a person sees. Class A co-founders see every ledger.
create table public.memberships (
  person_id uuid not null references public.people (id),
  ledger_id text not null references public.ledgers (id),
  role text not null check (role in ('td_cofounder', 'product_cofounder', 'product_team', 'accountant')),
  primary key (person_id, ledger_id)
);

-- Permissions are given on top of a role, per ledger.
create table public.permissions (
  person_id uuid not null references public.people (id),
  ledger_id text not null references public.ledgers (id),
  permission text not null check (permission in (
    'approver', 'second_signer', 'statement_checker', 'statement_preparer', 'task_reviewer',
    'month_closer', 'commission_assigner', 'special_price_approver', 'ledger_editor', 'settings_editor',
    'people_admin', 'task_assigner'
  )),
  limit_kes numeric,                          -- for approvers
  primary key (person_id, ledger_id, permission)
);

create or replace function public.is_td_cofounder() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships m where m.person_id = auth.uid() and m.role = 'td_cofounder');
$$;

create or replace function public.can_see_ledger(l text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_td_cofounder()
      or exists (select 1 from memberships m where m.person_id = auth.uid() and m.ledger_id = l);
$$;

create or replace function public.has_permission(l text, p text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.can_see_ledger(l)
     and exists (select 1 from permissions x where x.person_id = auth.uid() and x.ledger_id = l and x.permission = p);
$$;

-- ---------------------------------------------------------------- pots
create table public.pots (
  id text primary key,                        -- 'bidii.pool', 'company.fee', ...
  ledger_id text not null references public.ledgers (id),
  key text not null,
  name text not null,
  class_a_only boolean not null default false
);

-- ---------------------------------------------------------------- settings
-- Every value is versioned. A change is proposed, collects the approvals its
-- rule requires, and takes effect from the next period.
create table public.settings (
  id uuid primary key default gen_random_uuid(),
  ledger_id text not null references public.ledgers (id),
  key text not null,                          -- 'split', 'weights', 'pricing', 'commission', ...
  value jsonb not null,
  approval_rule text not null check (approval_rule in ('all_shareholders', 'both_classes', 'both_cofounders', 'holder')),
  effective_from date not null,
  status text not null default 'proposed' check (status in ('proposed', 'active', 'superseded', 'rejected')),
  reason text not null,
  proposed_by uuid references public.people (id),
  created_at timestamptz not null default now()
);
create unique index settings_one_active on public.settings (ledger_id, key) where status = 'active';

create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('setting', 'request', 'period', 'payment', 'finder_change', 'special_price', 'write_off')),
  subject_id uuid not null,
  person_id uuid not null references public.people (id),
  decision text not null check (decision in ('approve', 'reject')),
  note text,
  created_at timestamptz not null default now(),
  unique (subject_type, subject_id, person_id)
);

-- ---------------------------------------------------------------- periods
create table public.periods (
  id uuid primary key default gen_random_uuid(),
  ledger_id text not null references public.ledgers (id),
  starts_on date not null,
  ends_on date not null,
  status text not null default 'open' check (status in ('open', 'closing', 'closed')),
  result jsonb,                               -- month-end figures, frozen at close
  closed_by uuid references public.people (id),
  closed_at timestamptz,
  unique (ledger_id, starts_on)
);

-- ---------------------------------------------------------------- outside referrers
create table public.referrers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text not null,
  email text,
  added_by uuid references public.people (id),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- schools (read from Bidii)
create table public.schools (
  id uuid primary key default gen_random_uuid(),
  bidii_school_id text unique,               -- id in the Bidii super admin
  ledger_id text not null references public.ledgers (id) default 'bidii',
  name text not null,
  contact_name text,
  contact_phone text,
  contact_email text,
  package text not null check (package in ('monthly', 'termly', 'yearly', 'buy_it_once')),
  students integer not null default 0,
  low_fee boolean not null default false,
  founding10 boolean not null default false,
  group_id text,
  group_campuses integer,
  status text not null default 'signed' check (status in ('lead', 'signed', 'paying', 'paused', 'refunded', 'ended')),
  signed_on date,
  go_live_on date,
  -- The one field set in this app, by the commission role.
  finder_person_id uuid references public.people (id),
  finder_referrer_id uuid references public.referrers (id),
  special_price jsonb,                        -- terms outside the Pricing Guide, approved by Larmeck
  synced_at timestamptz,
  check (finder_person_id is null or finder_referrer_id is null)
);

-- ---------------------------------------------------------------- invoices
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  school_id uuid not null references public.schools (id),
  ledger_id text not null references public.ledgers (id),
  kind text not null check (kind in ('subscription', 'onboarding', 'messaging', 'licence', 'credit')),
  period_label text not null,                 -- 'Term 1 2027', 'February 2027'
  lines jsonb not null,
  amount numeric not null,
  issued_on date not null,
  due_on date not null,
  status text not null default 'open' check (status in ('open', 'part_paid', 'paid', 'written_off', 'credited')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- ledger lines
create table public.ledger_lines (
  id uuid primary key default gen_random_uuid(),
  ledger_id text not null references public.ledgers (id),
  occurred_on date not null,
  type text not null check (type in ('money_in', 'bill', 'commission', 'pay', 'fee', 'transfer', 'refund', 'advance_held', 'advance_release')),
  pot_id text references public.pots (id),
  amount numeric not null,                    -- money out is negative
  person_id uuid references public.people (id),
  referrer_id uuid references public.referrers (id),
  school_id uuid references public.schools (id),
  invoice_id uuid references public.invoices (id),
  request_id uuid,
  description text not null,
  receipt_path text,
  status text not null default 'draft' check (status in ('draft', 'approved', 'reconciled')),
  period_id uuid references public.periods (id),
  created_by uuid references public.people (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ledger_lines_ledger_date on public.ledger_lines (ledger_id, occurred_on);

-- Every change keeps the old value, who changed it, when and why.
create table public.ledger_line_history (
  id bigserial primary key,
  line_id uuid not null references public.ledger_lines (id),
  old_row jsonb not null,
  changed_by uuid default auth.uid(),
  changed_at timestamptz not null default now(),
  reason text not null
);

create or replace function public.ledger_line_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  closed boolean;
  why text := current_setting('app.change_reason', true);
begin
  if tg_op = 'DELETE' then
    raise exception 'Ledger lines are never deleted. Add a correcting line instead.';
  end if;
  select p.status = 'closed' into closed from periods p where p.id = old.period_id;
  if coalesce(closed, false) then
    raise exception 'This month is closed. Reopening it needs both co-founders.';
  end if;
  if why is null or why = '' then
    raise exception 'Give a reason for the change.';
  end if;
  insert into ledger_line_history (line_id, old_row, reason) values (old.id, to_jsonb(old), why);
  new.updated_at := now();
  return new;
end $$;

create trigger ledger_lines_guard before update or delete on public.ledger_lines
for each row execute function public.ledger_line_guard();

-- Edit a line with a reason in one call (the reason is required by the guard).
create or replace function public.update_ledger_line(line_id uuid, changes jsonb, reason text)
returns public.ledger_lines language plpgsql security invoker set search_path = public as $$
declare r public.ledger_lines;
begin
  perform set_config('app.change_reason', reason, true);
  update ledger_lines set
    occurred_on = coalesce((changes->>'occurred_on')::date, occurred_on),
    type        = coalesce(changes->>'type', type),
    pot_id      = coalesce(changes->>'pot_id', pot_id),
    amount      = coalesce((changes->>'amount')::numeric, amount),
    description = coalesce(changes->>'description', description),
    status      = coalesce(changes->>'status', status)
  where id = line_id
  returning * into r;
  return r;
end $$;

-- ---------------------------------------------------------------- spending requests
create table public.requests (
  id uuid primary key default gen_random_uuid(),
  ledger_id text not null references public.ledgers (id),
  pot_id text not null references public.pots (id),
  requester_id uuid not null references public.people (id) default auth.uid(),
  amount numeric not null check (amount > 0),
  purpose text not null,
  quote_path text,
  personal boolean not null default false,
  status text not null default 'waiting' check (status in ('waiting', 'approved', 'rejected', 'paid', 'closed')),
  paid_on date,
  receipt_path text,
  receipt_due_on date,
  spent numeric,
  created_at timestamptz not null default now()
);

-- Nobody approves their own request.
create or replace function public.approval_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.subject_type = 'request'
     and exists (select 1 from requests r where r.id = new.subject_id and r.requester_id = new.person_id) then
    raise exception 'Nobody can approve their own request.';
  end if;
  return new;
end $$;
create trigger approvals_guard before insert on public.approvals
for each row execute function public.approval_guard();

-- ---------------------------------------------------------------- statements
create table public.statements (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.periods (id),
  person_id uuid references public.people (id),
  referrer_id uuid references public.referrers (id),
  figures jsonb not null,                     -- every figure and how it was worked out
  total numeric not null,
  status text not null default 'prepared' check (status in ('prepared', 'checked', 'paid')),
  prepared_by uuid references public.people (id),
  checked_by uuid references public.people (id),
  paid_on date,
  check ((person_id is null) <> (referrer_id is null))
);

-- ---------------------------------------------------------------- recurring expenses
create table public.recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  ledger_id text not null references public.ledgers (id),
  name text not null,
  amount numeric not null,
  currency text not null default 'KES' check (currency in ('KES', 'USD')),
  fx_rate numeric,
  frequency text not null check (frequency in ('monthly', 'quarterly', 'yearly', 'once')),
  due_day integer not null check (due_day between 1 and 31),
  due_month integer check (due_month between 1 and 12),
  starts_on date not null,
  ends_on date,
  status text not null default 'active' check (status in ('active', 'paused')),
  approved_by uuid references public.people (id)
);

-- ---------------------------------------------------------------- share register
create table public.share_register (
  id uuid primary key default gen_random_uuid(),
  holder_id uuid references public.people (id),  -- null for a reserved pool
  share_class text not null check (share_class in ('A', 'B')),
  parts numeric not null,
  issued boolean not null default true,
  note text
);

-- ---------------------------------------------------------------- row level security
alter table public.people enable row level security;
alter table public.ledgers enable row level security;
alter table public.memberships enable row level security;
alter table public.permissions enable row level security;
alter table public.pots enable row level security;
alter table public.settings enable row level security;
alter table public.approvals enable row level security;
alter table public.periods enable row level security;
alter table public.referrers enable row level security;
alter table public.schools enable row level security;
alter table public.invoices enable row level security;
alter table public.ledger_lines enable row level security;
alter table public.ledger_line_history enable row level security;
alter table public.requests enable row level security;
alter table public.statements enable row level security;
alter table public.recurring_expenses enable row level security;
alter table public.share_register enable row level security;

create policy people_read on public.people for select to authenticated using (true);
-- People, memberships and permissions are written only by the server (service
-- role) after it checks the people_admin permission, so there are no insert or
-- update policies for them here.
create policy ledgers_read on public.ledgers for select to authenticated using (public.can_see_ledger(id));
create policy memberships_read on public.memberships for select to authenticated
  using (person_id = auth.uid() or public.is_td_cofounder());
create policy permissions_read on public.permissions for select to authenticated
  using (person_id = auth.uid() or public.is_td_cofounder());

create policy pots_read on public.pots for select to authenticated
  using (public.can_see_ledger(ledger_id) and (not class_a_only or public.is_td_cofounder()));

create policy settings_read on public.settings for select to authenticated using (public.can_see_ledger(ledger_id));
create policy settings_propose on public.settings for insert to authenticated
  with check (public.has_permission(ledger_id, 'settings_editor') and status = 'proposed');

-- You see approvals only on what you can see, and only approvers can record one.
create policy approvals_read on public.approvals for select to authenticated using (
  subject_type <> 'request'
  or exists (select 1 from requests r where r.id = subject_id and public.can_see_ledger(r.ledger_id)));
create policy approvals_insert on public.approvals for insert to authenticated with check (
  person_id = auth.uid()
  and (subject_type <> 'request'
       or exists (select 1 from requests r where r.id = subject_id
                  and (public.has_permission(r.ledger_id, 'approver') or public.has_permission(r.ledger_id, 'second_signer')))));

create policy periods_read on public.periods for select to authenticated using (public.can_see_ledger(ledger_id));

create policy referrers_read on public.referrers for select to authenticated using (
  public.is_td_cofounder() or exists (select 1 from permissions x where x.person_id = auth.uid() and x.permission = 'commission_assigner'));
create policy referrers_insert on public.referrers for insert to authenticated with check (
  exists (select 1 from permissions x where x.person_id = auth.uid() and x.permission = 'commission_assigner'));

create policy schools_read on public.schools for select to authenticated using (public.can_see_ledger(ledger_id));
create policy invoices_read on public.invoices for select to authenticated using (public.can_see_ledger(ledger_id));

create policy lines_read on public.ledger_lines for select to authenticated using (
  public.can_see_ledger(ledger_id)
  and (pot_id is null or not exists (select 1 from pots p where p.id = pot_id and p.class_a_only) or public.is_td_cofounder()));
create policy lines_insert on public.ledger_lines for insert to authenticated
  with check (
    public.has_permission(ledger_id, 'ledger_editor')
    -- A closed month is locked: nothing is added to it either.
    and (period_id is null or not exists (select 1 from periods p where p.id = period_id and p.status = 'closed')));
create policy lines_update on public.ledger_lines for update to authenticated
  using (public.has_permission(ledger_id, 'ledger_editor'));

create policy history_read on public.ledger_line_history for select to authenticated using (
  exists (select 1 from ledger_lines l where l.id = line_id and public.can_see_ledger(l.ledger_id)));

create policy requests_read on public.requests for select to authenticated using (public.can_see_ledger(ledger_id));
create policy requests_insert on public.requests for insert to authenticated
  with check (
    requester_id = auth.uid()
    and status = 'waiting'
    and public.can_see_ledger(ledger_id)
    -- The pot must belong to that ledger, and Class A pots only for Class A.
    and exists (select 1 from pots p where p.id = pot_id and p.ledger_id = requests.ledger_id
                and (not p.class_a_only or public.is_td_cofounder())));

-- Statements show pay: each person sees their own; checkers and Class A see all.
create policy statements_read on public.statements for select to authenticated using (
  person_id = auth.uid() or public.is_td_cofounder());

create policy recurring_read on public.recurring_expenses for select to authenticated using (public.can_see_ledger(ledger_id));
create policy register_read on public.share_register for select to authenticated using (
  public.is_td_cofounder() or share_class = 'B');

-- ---------------------------------------------------------------- audit log
create table public.audit_log (
  id bigserial primary key,
  actor_id uuid references public.people (id),
  action text not null,                       -- person_added, person_switched_off, ...
  subject_type text not null,
  subject_id text not null,
  details jsonb,
  created_at timestamptz not null default now()
);
alter table public.audit_log enable row level security;
create policy audit_read on public.audit_log for select to authenticated using (public.is_td_cofounder());

-- Ledger history is append-only for everyone.
revoke delete on all tables in schema public from anon, authenticated;
