-- The schedules that drive push reminders (Supabase only: pg_cron, pg_net,
-- Vault). The project address and the shared secret are stored in Vault by
-- scripts/migrate.mjs, never in this file.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Every minute: send what is due.
select cron.schedule(
  'send-reminders',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'reminders_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $$
);

-- Every hour: keep 60 days of reminders ahead, even if nobody opens the app.
select cron.schedule('roll-reminders', '5 * * * *', $$ select public.roll_reminders() $$);

-- Every night: forget old reminders.
select cron.schedule(
  'forget-old-reminders',
  '17 3 * * *',
  $$ delete from public.reminder_jobs where sent_at < now() - interval '30 days' or (sent_at is null and fire_at < now() - interval '1 day') $$
);
