-- Calendar and to-dos. The app keeps a copy on each device and syncs here,
-- so rows carry the device's own id and updated_at (last change wins).
-- Removing an event sets deleted_at so other devices learn about it.

create table public.calendar_events (
  id uuid primary key,
  owner_id uuid not null references public.people (id) default auth.uid(),
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  all_day boolean not null default false,
  -- 'personal' or a company's ledger id ('company', 'bidii', ...); see the policies below.
  calendar text not null,
  location text not null default '',
  notes text not null default '',
  repeat text not null default 'none' check (repeat in ('none', 'daily', 'weekdays', 'weekly', 'monthly', 'yearly')),
  repeat_until date,
  reminders integer[] not null default '{}',
  invitees uuid[] not null default '{}',
  updated_at timestamptz not null,
  deleted_at timestamptz,
  -- Personal events are never shared.
  check (calendar <> 'personal' or invitees = '{}')
);
create index calendar_events_owner_updated on public.calendar_events (owner_id, updated_at);
create index calendar_events_invitees on public.calendar_events using gin (invitees);

create table public.todos (
  id uuid primary key,
  owner_id uuid not null references public.people (id) default auth.uid(),
  title text not null,
  -- A task given by someone with the task_assigner permission, for a company.
  assigned_by uuid references public.people (id),
  ledger_id text references public.ledgers (id),
  scheduled_start timestamptz,
  duration_min integer not null default 30 check (duration_min between 5 and 720),
  due_on date,
  done_at timestamptz,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  check (assigned_by is null or ledger_id is not null)
);
create index todos_owner_updated on public.todos (owner_id, updated_at);

alter table public.calendar_events enable row level security;
alter table public.todos enable row level security;

-- Is a person in a company? Class A co-founders are in every company.
create or replace function public.person_in_ledger(p uuid, l text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships m where m.person_id = p and (m.ledger_id = l or m.role = 'td_cofounder'));
$$;

-- Your own events, and company events you were invited to, but only for
-- companies you are in: a Bidii-only member never sees Trillionaire Designs.
create policy events_read on public.calendar_events for select to authenticated
  using (owner_id = auth.uid()
         or (calendar <> 'personal' and auth.uid() = any (invitees) and public.can_see_ledger(calendar)));
create policy events_insert on public.calendar_events for insert to authenticated
  with check (owner_id = auth.uid() and (calendar = 'personal' or public.can_see_ledger(calendar)));
create policy events_update on public.calendar_events for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and (calendar = 'personal' or public.can_see_ledger(calendar)));

-- Your own to-dos, tasks given to you, and tasks you gave.
create policy todos_read on public.todos for select to authenticated
  using (owner_id = auth.uid() or assigned_by = auth.uid());
create policy todos_insert on public.todos for insert to authenticated
  with check (
    (owner_id = auth.uid() and assigned_by is null)
    or (assigned_by = auth.uid()
        and public.has_permission(ledger_id, 'task_assigner')
        and public.person_in_ledger(owner_id, ledger_id)));
-- The person can tick it off; the giver can change or cancel it.
create policy todos_update on public.todos for update to authenticated
  using (owner_id = auth.uid() or assigned_by = auth.uid())
  with check (owner_id = auth.uid() or assigned_by = auth.uid());

-- Devices fetch "what changed since I last looked" by the time the server
-- received a row, not the time it was edited: an edit made offline yesterday
-- and synced today must still reach the other devices.
alter table public.calendar_events add column synced_at timestamptz not null default now();
alter table public.todos add column synced_at timestamptz not null default now();
create index calendar_events_synced on public.calendar_events (synced_at);
create index todos_synced on public.todos (synced_at);

create or replace function public.stamp_synced_at() returns trigger
language plpgsql as $$
begin
  new.synced_at := clock_timestamp();
  return new;
end $$;

create trigger calendar_events_synced before insert or update on public.calendar_events
for each row execute function public.stamp_synced_at();
create trigger todos_synced before insert or update on public.todos
for each row execute function public.stamp_synced_at();
