-- Push reminders that arrive even when the app is closed, scheduled here in
-- the database so they never depend on anyone opening the app:
--
--  • push_subscriptions: each device that turned reminders on.
--  • reminder_jobs: what to send and when, for the next 60 days. Kept up to
--    date by triggers whenever an event or task changes (for the owner and
--    everyone invited), and topped up every hour (0007).
--  • send-reminders (Edge Function, every minute) claims due jobs and sends
--    them; a failed send is tried again, up to 3 times.

create table public.push_subscriptions (
  endpoint text primary key,
  person_id uuid not null references public.people (id),
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_sent_at timestamptz
);
create index push_subscriptions_person on public.push_subscriptions (person_id);

create table public.reminder_jobs (
  person_id uuid not null references public.people (id),
  id text not null,                           -- same id the app uses, so nothing is shown twice
  kind text not null check (kind in ('event', 'task', 'task_given')),
  source_id text not null,                    -- the event or task it comes from
  fire_at timestamptz not null,
  title text not null,
  body text not null default '',
  url text not null default '/calendar',
  attempts integer not null default 0,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (person_id, id)
);
create index reminder_jobs_due on public.reminder_jobs (fire_at) where sent_at is null;
create index reminder_jobs_source on public.reminder_jobs (source_id);

alter table public.push_subscriptions enable row level security;
alter table public.reminder_jobs enable row level security;
create policy push_read on public.push_subscriptions for select to authenticated using (person_id = auth.uid());
create policy jobs_read on public.reminder_jobs for select to authenticated using (person_id = auth.uid());
-- All writes go through the functions below.

-- ------------------------------------------------------------------ devices

-- A device turns reminders on. If another person used this browser before,
-- the address moves to whoever is signed in now.
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text)
returns void language sql security definer set search_path = public as $$
  insert into push_subscriptions (endpoint, person_id, p256dh, auth, user_agent)
  values (p_endpoint, auth.uid(), p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update
    set person_id = auth.uid(), p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent;
$$;

create or replace function public.remove_push_subscription(p_endpoint text)
returns void language sql security definer set search_path = public as $$
  delete from push_subscriptions where endpoint = p_endpoint and person_id = auth.uid();
$$;

-- ------------------------------------------------------------------ events

-- Replaces an event's waiting reminders, for its owner and everyone invited
-- who is in that company. Times are written in each reader's time zone.
create or replace function public.refresh_event_reminders(p_event uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from reminder_jobs where source_id = p_event::text and kind = 'event' and sent_at is null;

  insert into reminder_jobs (person_id, id, kind, source_id, fire_at, title, body)
  select r.id,
         occurrence_key(e.id, e.repeat, o) || ':' || m,
         'event',
         e.id::text,
         o - make_interval(mins => m),
         e.title,
         reminder_body(o, e.all_day, e.location, r.timezone)
    from calendar_events e
    join people owner on owner.id = e.owner_id
   cross join lateral event_occurrence_starts(e.starts_at, e.ends_at, e.repeat, e.repeat_until, owner.timezone, now(), now() + interval '61 days') o
   cross join unnest(e.reminders) m
    join people r on r.active
                 and (r.id = e.owner_id
                      or (e.calendar <> 'personal' and r.id = any (e.invitees) and person_in_ledger(r.id, e.calendar)))
   where e.id = p_event
     and e.deleted_at is null
     and o - make_interval(mins => m) > now()
     and o - make_interval(mins => m) <= now() + interval '60 days'
  on conflict (person_id, id) do nothing;
end $$;

create or replace function public.event_reminders_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform refresh_event_reminders(new.id);
  return new;
end $$;

create trigger calendar_events_reminders after insert or update on public.calendar_events
for each row execute function public.event_reminders_trigger();

-- ------------------------------------------------------------------ tasks

-- A planned task 10 minutes before; a task due on a day at 8am that day, in
-- the person's time zone. Done or removed tasks have none.
create or replace function public.refresh_task_reminder(p_todo uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from reminder_jobs where source_id = p_todo::text and kind = 'task' and sent_at is null;

  insert into reminder_jobs (person_id, id, kind, source_id, fire_at, title, body)
  select t.owner_id,
         'task:' || t.id || ':' || to_char(f.at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
         'task',
         t.id::text,
         f.at,
         t.title,
         case when t.scheduled_start is not null then 'Planned for ' || to_char(t.scheduled_start at time zone p.timezone, 'FMHH24:MI') else 'Due today' end
    from todos t
    join people p on p.id = t.owner_id and p.active
   cross join lateral (
     select case when t.scheduled_start is not null then t.scheduled_start - interval '10 minutes'
                 when t.due_on is not null then (t.due_on + time '08:00') at time zone p.timezone end as at
   ) f
   where t.id = p_todo
     and t.done_at is null and t.deleted_at is null
     and f.at > now() and f.at <= now() + interval '60 days'
  on conflict (person_id, id) do nothing;
end $$;

create or replace function public.task_reminders_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  giver text;
begin
  perform refresh_task_reminder(new.id);

  -- "Miguel gave you a task" reaches the person at once, the first time only.
  if tg_op = 'INSERT' and new.assigned_by is not null and new.assigned_by <> new.owner_id then
    select split_part(full_name, ' ', 1) into giver from people where id = new.assigned_by;
    insert into reminder_jobs (person_id, id, kind, source_id, fire_at, title, body)
    values (new.owner_id, 'given:' || new.id, 'task_given', new.id::text, now(),
            coalesce(giver, 'Someone') || ' gave you a task',
            new.title || coalesce(' · due ' || to_char(new.due_on, 'Dy DD Mon'), ''))
    on conflict (person_id, id) do nothing;
  end if;
  return new;
end $$;

create trigger todos_reminders after insert or update on public.todos
for each row execute function public.task_reminders_trigger();

-- ------------------------------------------------------------------ rolling window

-- Run every hour (0007): keeps 60 days of reminders ahead for everything,
-- and picks up changes such as someone joining a company or moving time zone.
create or replace function public.roll_reminders()
returns integer language plpgsql security definer set search_path = public as $$
declare
  n integer := 0;
  r record;
begin
  for r in select id from calendar_events where deleted_at is null and cardinality(reminders) > 0 loop
    perform refresh_event_reminders(r.id);
    n := n + 1;
  end loop;
  for r in select id from todos where done_at is null and deleted_at is null and (scheduled_start is not null or due_on is not null) loop
    perform refresh_task_reminder(r.id);
  end loop;
  return n;
end $$;

-- ------------------------------------------------------------------ sending

-- Takes the jobs that are due and marks them sent, so two runs never send the
-- same one. Jobs more than 6 hours late are skipped rather than sent stale.
create or replace function public.claim_due_reminders(max_jobs integer default 500)
returns setof public.reminder_jobs language sql security definer set search_path = public as $$
  update reminder_jobs r set sent_at = now(), attempts = r.attempts + 1
   where (r.person_id, r.id) in (
     select person_id, id from reminder_jobs
      where sent_at is null and fire_at <= now() and fire_at > now() - interval '6 hours'
      order by fire_at
      limit max_jobs
      for update skip locked)
  returning r.*;
$$;

-- Puts back jobs whose sending failed, to try again next minute (3 tries in all).
create or replace function public.release_reminders(jobs jsonb)
returns integer language sql security definer set search_path = public as $$
  with released as (
    update reminder_jobs r set sent_at = null
      from jsonb_array_elements(jobs) j
     where r.person_id = (j->>'person_id')::uuid and r.id = j->>'id' and r.attempts < 3
    returning 1
  )
  select count(*)::integer from released;
$$;

revoke execute on function public.claim_due_reminders(integer) from public, anon, authenticated;
revoke execute on function public.release_reminders(jsonb) from public, anon, authenticated;
revoke execute on function public.roll_reminders() from public, anon, authenticated;
revoke execute on function public.refresh_event_reminders(uuid) from public, anon, authenticated;
revoke execute on function public.refresh_task_reminder(uuid) from public, anon, authenticated;
