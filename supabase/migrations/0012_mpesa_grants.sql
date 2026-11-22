-- M-PESA functions: only signed-in people may call the ones meant for them,
-- and nobody calls the internal ones through the API (Postgres grants every
-- new function to PUBLIC, which anon inherits). Each function still checks
-- the person's permission itself.

revoke execute on function public.mpesa_save_config(boolean, text, text, text, text, text, text, text) from public, anon;
revoke execute on function public.mpesa_reconcile(uuid, uuid, uuid, text) from public, anon;
revoke execute on function public.mpesa_reverse(uuid, text) from public, anon;
revoke execute on function public.mpesa_retry_callback(bigint) from public, anon;
revoke execute on function public.mark_notifications_read(text[]) from public, anon;
revoke execute on function public.mpesa_ledger() from public, anon;
grant execute on function public.mpesa_save_config(boolean, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.mpesa_reconcile(uuid, uuid, uuid, text) to authenticated;
grant execute on function public.mpesa_reverse(uuid, text) to authenticated;
grant execute on function public.mpesa_retry_callback(bigint) to authenticated;
grant execute on function public.mark_notifications_read(text[]) to authenticated;
grant execute on function public.mpesa_ledger() to authenticated;   -- used by row level security

-- A trigger function is never called directly.
revoke execute on function public.mpesa_transaction_notice() from public, anon, authenticated;

-- Plain helpers: fixed search_path.
alter function public.mpesa_kes(numeric) set search_path = pg_catalog;
alter function public.mpesa_phone(text) set search_path = pg_catalog;
