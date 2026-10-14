-- The owner: one person who can do everything in the app. Everyone else can
-- change Settings, people or roles only if the owner gives them that role
-- (settings_editor, people_admin). Setting changes take effect at once, are
-- recorded with the reason, and everyone is told.

alter table public.people add column is_owner boolean not null default false;
create unique index people_one_owner on public.people (is_owner) where is_owner;

create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from people where id = auth.uid() and is_owner and active);
$$;

-- The owner sees every ledger and holds every permission.
create or replace function public.can_see_ledger(l text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_owner()
      or public.is_td_cofounder()
      or exists (select 1 from memberships m where m.person_id = auth.uid() and m.ledger_id = l);
$$;

create or replace function public.has_permission(l text, p text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_owner()
      or (public.can_see_ledger(l)
          and exists (select 1 from permissions x where x.person_id = auth.uid() and x.ledger_id = l and x.permission = p));
$$;

-- Notices ("Miguel changed the team pool weights") go out like reminders.
alter table public.reminder_jobs drop constraint reminder_jobs_kind_check;
alter table public.reminder_jobs add constraint reminder_jobs_kind_check
  check (kind in ('event', 'task', 'task_given', 'notice'));

-- Change a setting. Allowed for the owner and for anyone the owner gave the
-- settings_editor role on that ledger. The old value stays in the history.
create or replace function public.change_setting(p_ledger text, p_key text, p_value jsonb, p_reason text, p_label text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
  who text;
  total numeric;
begin
  if not public.has_permission(p_ledger, 'settings_editor') then
    raise exception 'Only the owner, or someone the owner allows, can change Settings.';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Give a reason for the change.';
  end if;
  if p_key = 'split' then
    select sum(value::numeric) into total from jsonb_each_text(p_value);
    if abs(total - 1) > 0.0001 then
      raise exception 'The split must add up to 100%%.';
    end if;
  end if;

  update settings set status = 'superseded' where ledger_id = p_ledger and key = p_key and status = 'active';
  insert into settings (ledger_id, key, value, approval_rule, effective_from, status, reason, proposed_by)
  values (p_ledger, p_key, p_value,
          coalesce((select approval_rule from settings where ledger_id = p_ledger and key = p_key order by created_at desc limit 1), 'both_cofounders'),
          current_date, 'active', p_reason, auth.uid())
  returning id into new_id;

  insert into audit_log (actor_id, action, subject_type, subject_id, details)
  values (auth.uid(), 'setting_changed', 'setting', new_id::text,
          jsonb_build_object('ledger', p_ledger, 'key', p_key, 'value', p_value, 'reason', p_reason));

  -- Tell everyone who can see that ledger, straight away.
  select split_part(full_name, ' ', 1) into who from people where id = auth.uid();
  insert into reminder_jobs (person_id, id, kind, source_id, fire_at, title, body, url)
  select p.id, 'setting:' || new_id, 'notice', new_id::text, now(),
         coalesce(who, 'Someone') || ' changed ' || coalesce(nullif(p_label, ''), p_key),
         left(p_reason, 200), '/settings'
    from people p
   where p.active and p.id <> auth.uid()
     and (p.is_owner or exists (select 1 from memberships m where m.person_id = p.id
                                 and (m.ledger_id = p_ledger or m.role = 'td_cofounder')));
  return new_id;
end $$;

-- Give or take away roles: the owner, or someone the owner gave people_admin.
create or replace function public.set_permissions(p_person uuid, p_permissions jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_permission('company', 'people_admin') then
    raise exception 'Only the owner, or someone the owner allows, can change roles.';
  end if;
  if exists (select 1 from people where id = p_person and is_owner) then
    raise exception 'The owner always has every permission.';
  end if;
  delete from permissions where person_id = p_person;
  insert into permissions (person_id, ledger_id, permission, limit_kes)
  select p_person, x->>'ledgerId', x->>'permission', nullif(x->>'limitKes', '')::numeric
    from jsonb_array_elements(p_permissions) x
   where public.person_in_ledger(p_person, x->>'ledgerId');
  insert into audit_log (actor_id, action, subject_type, subject_id, details)
  values (auth.uid(), 'roles_changed', 'person', p_person::text, p_permissions);
end $$;

revoke execute on function public.change_setting(text, text, jsonb, text, text) from anon;
revoke execute on function public.set_permissions(uuid, jsonb) from anon;
