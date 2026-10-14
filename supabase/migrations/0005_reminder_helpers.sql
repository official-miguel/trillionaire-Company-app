-- Pure helpers for scheduling reminders in the database. They use no tables,
-- so they can be tested on their own (src/lib/calendar/reminderSql.test.ts).
-- They follow the app's repeat rules (src/lib/calendar/recurrence.ts):
-- repeats happen at the same clock time in the owner's time zone.

-- Every start of an event between p_from and p_to.
create or replace function public.event_occurrence_starts(
  p_start timestamptz,
  p_end timestamptz,
  p_repeat text,
  p_repeat_until date,
  p_tz text,
  p_from timestamptz,
  p_to timestamptz
) returns setof timestamptz
language plpgsql immutable as $$
declare
  local_start timestamp := p_start at time zone p_tz;
  len interval := p_end - p_start;
  step interval;
  n0 integer := 0;
  n integer;
  local_occ timestamp;
  occ timestamptz;
  -- "Repeat until" includes that whole day, in the owner's time zone.
  until_ts timestamptz := case when p_repeat_until is null then null else ((p_repeat_until + 1)::timestamp at time zone p_tz) end;
begin
  if p_repeat = 'none' then
    if p_end > p_from and p_start < p_to then
      return next p_start;
    end if;
    return;
  end if;

  step := case p_repeat
    when 'daily' then interval '1 day'
    when 'weekdays' then interval '1 day'
    when 'weekly' then interval '7 days'
    when 'monthly' then interval '1 month'
    when 'yearly' then interval '1 year'
  end;
  if step is null then return; end if;

  -- Start close to the range so events that began years ago stay quick.
  if p_repeat in ('daily', 'weekdays', 'weekly') then
    n0 := greatest(0, floor(extract(epoch from (p_from - p_start - len)) / extract(epoch from step))::integer - 1);
  elsif p_repeat = 'monthly' then
    n0 := greatest(0, (extract(year from age(p_from, p_start)) * 12 + extract(month from age(p_from, p_start)))::integer - 1);
  else
    n0 := greatest(0, extract(year from age(p_from, p_start))::integer - 1);
  end if;

  n := n0;
  loop
    -- Always counted from the first start, so the 31st stays the 31st where the month has one.
    local_occ := local_start + step * n;
    occ := local_occ at time zone p_tz;
    exit when occ >= p_to or (until_ts is not null and occ >= until_ts) or n > n0 + 2000;
    if not (p_repeat = 'weekdays' and extract(isodow from local_occ) in (6, 7)) and occ + len > p_from then
      return next occ;
    end if;
    n := n + 1;
  end loop;
end $$;

-- The same id the app gives each showing ("<event id>:<UTC start>"), so a
-- device never shows a reminder twice. The start is part of it, so an event
-- moved to a new time gets a new reminder even if the old one was sent.
create or replace function public.occurrence_key(p_event uuid, p_repeat text, p_occ timestamptz)
returns text language sql immutable as $$
  select p_event::text || ':' || to_char(p_occ at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
$$;

-- "15:00 · Thika" in the reader's time zone, or "Today" for an all-day event.
create or replace function public.reminder_body(p_occ timestamptz, p_all_day boolean, p_location text, p_tz text)
returns text language sql immutable as $$
  select case when p_all_day then 'Today'
              else to_char(p_occ at time zone p_tz, 'FMHH24:MI') || case when coalesce(p_location, '') <> '' then ' · ' || p_location else '' end end;
$$;
