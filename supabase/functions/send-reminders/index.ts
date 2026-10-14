// Supabase Edge Function: sends the reminders that are due, as Web Push
// notifications, to every device each person turned reminders on for.
// Called every minute by pg_cron (supabase/migrations/0007_reminder_schedule.sql).
//
// A send that fails is tried again at once; if it still fails, the reminder
// is handed back and tried next minute (3 tries in all, see release_reminders).
//
// Secrets (supabase secrets set): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
// VAPID_SUBJECT, REMINDERS_CRON_SECRET. SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const secret = Deno.env.get("REMINDERS_CRON_SECRET");
webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT")!, Deno.env.get("VAPID_PUBLIC_KEY")!, Deno.env.get("VAPID_PRIVATE_KEY")!);

interface Job {
  person_id: string;
  id: string;
  kind: string;
  title: string;
  body: string;
  url: string;
}
interface Sub {
  endpoint: string;
  person_id: string;
  p256dh: string;
  auth: string;
}

type Outcome = "sent" | "gone" | "failed";

async function sendOnce(sub: Sub, job: Job): Promise<Outcome> {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify({ title: job.title, body: job.body, url: job.url, tag: job.id, kind: job.kind }),
      // A phone that is off gets it when it comes back, for up to 6 hours.
      { TTL: 6 * 3600, urgency: job.kind === "task_given" ? "normal" : "high" },
    );
    return "sent";
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode;
    // The device turned notifications off, or the browser was reset.
    return status === 404 || status === 410 ? "gone" : "failed";
  }
}

async function send(sub: Sub, job: Job): Promise<Outcome> {
  const first = await sendOnce(sub, job);
  if (first !== "failed") return first;
  await new Promise((r) => setTimeout(r, 1500));
  return sendOnce(sub, job);
}

Deno.serve(async (req) => {
  if (!secret || req.headers.get("x-cron-secret") !== secret) {
    return new Response("Unauthorized", { status: 401 });
  }

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  const { data: jobs, error } = await sb.rpc("claim_due_reminders", { max_jobs: 500 });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!jobs?.length) return Response.json({ sent: 0 });

  const people = [...new Set((jobs as Job[]).map((j) => j.person_id))];
  const { data: subs, error: subsError } = await sb
    .from("push_subscriptions")
    .select("endpoint, person_id, p256dh, auth")
    .in("person_id", people);
  if (subsError) {
    // Couldn't even look up devices: hand everything back for next minute.
    await sb.rpc("release_reminders", { jobs: (jobs as Job[]).map((j) => ({ person_id: j.person_id, id: j.id })) });
    return Response.json({ error: subsError.message }, { status: 500 });
  }

  let sent = 0;
  const gone = new Set<string>();
  const used = new Set<string>();
  const failedJobs: { person_id: string; id: string }[] = [];

  await Promise.all(
    (jobs as Job[]).map(async (job) => {
      const devices = (subs ?? []).filter((s) => s.person_id === job.person_id);
      const outcomes = await Promise.all(devices.map(async (s) => [s, await send(s, job)] as const));
      for (const [s, o] of outcomes) {
        if (o === "sent") {
          sent++;
          used.add(s.endpoint);
        } else if (o === "gone") gone.add(s.endpoint);
      }
      // Reached no device, but at least one may still work: try again later.
      if (outcomes.some(([, o]) => o === "failed") && !outcomes.some(([, o]) => o === "sent")) {
        failedJobs.push({ person_id: job.person_id, id: job.id });
      }
    }),
  );

  if (failedJobs.length) await sb.rpc("release_reminders", { jobs: failedJobs });
  if (gone.size) await sb.from("push_subscriptions").delete().in("endpoint", [...gone]);
  if (used.size) await sb.from("push_subscriptions").update({ last_sent_at: new Date().toISOString() }).in("endpoint", [...used]);

  return Response.json({ jobs: jobs.length, sent, retryLater: failedJobs.length, removed: gone.size });
});
