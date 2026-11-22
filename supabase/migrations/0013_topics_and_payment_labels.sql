-- Custom topics (the "+" tab on Money) and labels for M-PESA payments.
-- Labels only: nothing here credits an invoice or touches a ledger line.
-- Safe to run twice (the topics table may already exist).

create table if not exists public.custom_topics (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 60),
  icon text not null default '📌',
  color text not null default '#7cc242',
  fields jsonb not null default '[]'::jsonb,
  items jsonb not null default '[]'::jsonb,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Each person's topics are their own: nobody else can see or change them.
alter table public.custom_topics add column if not exists owner_id uuid not null default auth.uid() references public.people(id) on delete cascade;
alter table public.custom_topics enable row level security;
drop policy if exists custom_topics_owner on public.custom_topics;
drop policy if exists custom_topics_own on public.custom_topics;
create policy custom_topics_own on public.custom_topics for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Which custom topic or category an unidentified payment was put under by hand.
create table if not exists public.mpesa_payment_labels (
  transaction_id uuid primary key references public.mpesa_transactions(id),
  target_kind text not null check (target_kind in ('topic', 'category')),
  target_id text not null,
  target_label text not null,
  assigned_by uuid,
  assigned_at timestamptz not null default now()
);

-- "Remember it next time": the account number typed on a payment -> the same label.
create table if not exists public.mpesa_label_rules (
  account_ref text primary key,
  target_kind text not null check (target_kind in ('topic', 'category')),
  target_id text not null,
  target_label text not null,
  updated_at timestamptz not null default now()
);

alter table public.mpesa_payment_labels enable row level security;
alter table public.mpesa_label_rules enable row level security;

drop policy if exists mpesa_payment_labels_read on public.mpesa_payment_labels;
drop policy if exists mpesa_payment_labels_write on public.mpesa_payment_labels;
drop policy if exists mpesa_label_rules_read on public.mpesa_label_rules;
drop policy if exists mpesa_label_rules_write on public.mpesa_label_rules;
create policy mpesa_payment_labels_read on public.mpesa_payment_labels for select to authenticated using (public.can_see_ledger(public.mpesa_ledger()));
create policy mpesa_payment_labels_write on public.mpesa_payment_labels for all to authenticated using (public.has_permission(public.mpesa_ledger(), 'ledger_editor')) with check (public.has_permission(public.mpesa_ledger(), 'ledger_editor'));
create policy mpesa_label_rules_read on public.mpesa_label_rules for select to authenticated using (public.can_see_ledger(public.mpesa_ledger()));
create policy mpesa_label_rules_write on public.mpesa_label_rules for all to authenticated using (public.has_permission(public.mpesa_ledger(), 'ledger_editor')) with check (public.has_permission(public.mpesa_ledger(), 'ledger_editor'));
