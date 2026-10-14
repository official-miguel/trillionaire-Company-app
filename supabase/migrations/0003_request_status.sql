-- Moves a request to approved or rejected, checking the approval rules in the
-- database so the browser can never approve a request on its own.
create or replace function public.set_request_status(request_id uuid, new_status text)
returns void language plpgsql security definer set search_path = public as $$
declare
  r requests;
  pot_key text;
  single_limit numeric;
  approvals_ok int;
begin
  select * into r from requests where id = request_id for update;
  if r is null or r.status <> 'waiting' then
    raise exception 'This request is not waiting for approval.';
  end if;
  if r.requester_id = auth.uid() then
    raise exception 'Nobody can approve their own request.';
  end if;
  if not (public.has_permission(r.ledger_id, 'approver') or public.has_permission(r.ledger_id, 'second_signer')) then
    raise exception 'You cannot approve requests on this ledger.';
  end if;

  if new_status = 'rejected' then
    if not exists (select 1 from approvals a where a.subject_type = 'request' and a.subject_id = request_id
                   and a.person_id = auth.uid() and a.decision = 'reject') then
      raise exception 'Record your decision first.';
    end if;
    update requests set status = 'rejected' where id = request_id;
    return;
  end if;

  if new_status <> 'approved' then
    raise exception 'Unknown status %', new_status;
  end if;

  select key into pot_key from pots where id = r.pot_id;
  select coalesce((value->>'singleApproverLimit')::numeric, 20000) into single_limit
    from settings where ledger_id = 'bidii' and key = 'requests' and status = 'active';
  single_limit := coalesce(single_limit, 20000);

  if pot_key = 'reserve' or r.amount > single_limit then
    select count(distinct a.person_id) into approvals_ok
      from approvals a join permissions p on p.person_id = a.person_id
     where a.subject_type = 'request' and a.subject_id = request_id and a.decision = 'approve'
       and p.ledger_id = r.ledger_id and p.permission = 'second_signer' and a.person_id <> r.requester_id;
    if approvals_ok < 2 then raise exception 'This request needs two approvals.'; end if;
  else
    select count(distinct a.person_id) into approvals_ok
      from approvals a join permissions p on p.person_id = a.person_id
     where a.subject_type = 'request' and a.subject_id = request_id and a.decision = 'approve'
       and p.ledger_id = r.ledger_id and p.permission = 'approver' and coalesce(p.limit_kes, 0) >= r.amount
       and a.person_id <> r.requester_id;
    if approvals_ok < 1 then raise exception 'This request needs an approval.'; end if;
  end if;

  update requests set status = 'approved' where id = request_id;
end $$;

revoke execute on function public.set_request_status(uuid, text) from anon;
