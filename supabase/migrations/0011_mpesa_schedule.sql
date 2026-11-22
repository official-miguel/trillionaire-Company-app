-- Schedules for M-PESA (Supabase only: pg_cron, from 0007).

-- Every 5 minutes: try again any callback that failed or was never processed.
select cron.schedule('retry-mpesa-callbacks', '*/5 * * * *', $$ select public.mpesa_retry_callbacks() $$);

-- Every night: forget old reminders, but keep what the bell shows (notices,
-- payments and given tasks) for 60 days, sent to a device or not.
select cron.schedule(
  'forget-old-reminders',
  '17 3 * * *',
  $$
  delete from public.reminder_jobs
   where (kind in ('notice', 'payment', 'task_given') and fire_at < now() - interval '60 days')
      or (kind not in ('notice', 'payment', 'task_given')
          and (sent_at < now() - interval '30 days' or (sent_at is null and fire_at < now() - interval '1 day')))
  $$
);
