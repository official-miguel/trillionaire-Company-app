// Runs the real migrations (0001–0006) in an in-memory Postgres and checks
// that reminders are scheduled by the database for owners and invitees,
// follow changes, and are retried when sending fails.
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

let db: PGlite;
const MIGRATIONS = ["0001_phase1", "0002_seed", "0003_request_status", "0004_calendar", "0005_reminder_helpers", "0006_push_reminders"];

const ID = {
  miguel: "00000000-0000-0000-0000-00000000000a",
  samuel: "00000000-0000-0000-0000-00000000000b",
  romeo: "00000000-0000-0000-0000-00000000000c",
  outsider: "00000000-0000-0000-0000-00000000000d",
  event: "10000000-0000-0000-0000-000000000001",
  todo: "20000000-0000-0000-0000-000000000001",
};

beforeAll(async () => {
  db = new PGlite();
  // The pieces Supabase provides.
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  `);
  for (const m of MIGRATIONS) {
    const sql = readFileSync(`supabase/migrations/${m}.sql`, "utf8").replace("create extension if not exists pgcrypto;", "");
    await db.exec(sql);
  }
  await db.exec(`
    insert into ledgers (id, name, kind) values ('otherapp', 'Other app', 'product');
    insert into auth.users (id) values ('${ID.miguel}'), ('${ID.samuel}'), ('${ID.romeo}'), ('${ID.outsider}');
    insert into people (id, slug, full_name, email, share_class, timezone, must_change_password) values
      ('${ID.miguel}', 'miguel', 'Miguel Muiruri', 'm@x.co', 'A', 'Africa/Nairobi', false),
      ('${ID.samuel}', 'samuel', 'Samuel Kuhia', 's@x.co', 'B', 'Africa/Nairobi', false),
      ('${ID.romeo}', 'romeo', 'Romeo Mbote', 'r@x.co', 'A', 'America/New_York', false),
      ('${ID.outsider}', 'out', 'Out Sider', 'o@x.co', null, 'Africa/Nairobi', false);
    insert into memberships (person_id, ledger_id, role) values
      ('${ID.miguel}', 'company', 'td_cofounder'), ('${ID.miguel}', 'bidii', 'td_cofounder'),
      ('${ID.romeo}', 'company', 'td_cofounder'), ('${ID.romeo}', 'bidii', 'td_cofounder'),
      ('${ID.samuel}', 'bidii', 'product_cofounder'),
      ('${ID.outsider}', 'otherapp', 'product_team');
  `);
});

beforeEach(async () => {
  await db.exec(`delete from reminder_jobs; delete from calendar_events; delete from todos;`);
});

async function jobs(person?: string) {
  const r = await db.query<{ person: string; kind: string; title: string; body: string; mins: number }>(
    `select p.slug person, j.kind, j.title, j.body, round(extract(epoch from (j.fire_at - now())) / 60)::int mins
       from reminder_jobs j join people p on p.id = j.person_id
      where j.sent_at is null ${person ? "and p.slug = $1" : ""}
      order by j.fire_at, p.slug`,
    person ? [person] : [],
  );
  return r.rows;
}

async function addEvent(over: Record<string, string> = {}) {
  const v = {
    starts: "now() + interval '2 hours'",
    ends: "now() + interval '3 hours'",
    calendar: "'bidii'",
    repeat: "'none'",
    invitees: `'{}'::uuid[]`,
    reminders: "'{10}'::int[]",
    ...over,
  };
  await db.exec(`
    insert into calendar_events (id, owner_id, title, starts_at, ends_at, calendar, location, repeat, reminders, invitees, updated_at)
    values ('${ID.event}', '${ID.miguel}', 'School visit', ${v.starts}, ${v.ends}, ${v.calendar}, 'Thika', ${v.repeat}, ${v.reminders}, ${v.invitees}, now())`);
}

describe("reminders scheduled by the database", () => {
  it("schedules the owner's reminder when an event is saved", async () => {
    await addEvent();
    expect(await jobs()).toEqual([{ person: "miguel", kind: "event", title: "School visit", body: expect.stringContaining("· Thika"), mins: 110 }]);
  });

  it("schedules invitees too, in their own time zone, but only people in that company", async () => {
    await addEvent({ invitees: `array['${ID.samuel}', '${ID.romeo}', '${ID.outsider}']::uuid[]` });
    const all = await jobs();
    expect(all.map((j) => j.person).sort()).toEqual(["miguel", "romeo", "samuel"]);
    const time = (p: string) => all.find((j) => j.person === p)!.body.split(" ·")[0];
    // Same moment, Nairobi vs New York clocks (7 or 8 hours apart).
    const diff = (Number(time("miguel").split(":")[0]) - Number(time("romeo").split(":")[0]) + 24) % 24;
    expect([7, 8]).toContain(diff);
  });

  it("never shares a personal event, even if someone is listed", async () => {
    await expect(addEvent({ calendar: "'personal'", invitees: `array['${ID.samuel}']::uuid[]` })).rejects.toThrow();
  });

  it("follows the event when the owner moves it", async () => {
    await addEvent({ invitees: `array['${ID.samuel}']::uuid[]` });
    await db.exec(`update calendar_events set starts_at = now() + interval '5 hours', ends_at = now() + interval '6 hours' where id = '${ID.event}'`);
    expect((await jobs()).map((j) => [j.person, j.mins])).toEqual([
      ["miguel", 290],
      ["samuel", 290],
    ]);
  });

  it("schedules a moved event again even after its first reminder was sent", async () => {
    await addEvent();
    await db.exec(`update reminder_jobs set sent_at = now()`);
    await db.exec(`update calendar_events set starts_at = now() + interval '5 hours', ends_at = now() + interval '6 hours' where id = '${ID.event}'`);
    expect((await jobs()).map((j) => j.mins)).toEqual([290]);
  });

  it("drops reminders when the event is deleted or someone is uninvited", async () => {
    await addEvent({ invitees: `array['${ID.samuel}']::uuid[]` });
    await db.exec(`update calendar_events set invitees = '{}' where id = '${ID.event}'`);
    expect((await jobs()).map((j) => j.person)).toEqual(["miguel"]);
    await db.exec(`update calendar_events set deleted_at = now() where id = '${ID.event}'`);
    expect(await jobs()).toEqual([]);
  });

  it("covers 60 days of a weekly event", async () => {
    await addEvent({ repeat: "'weekly'" });
    expect((await jobs()).length).toBeGreaterThanOrEqual(8);
    expect((await jobs()).length).toBeLessThanOrEqual(9);
  });

  it("tells someone at once when they are given a task, and reminds them on the due day", async () => {
    await db.exec(`
      insert into todos (id, owner_id, title, assigned_by, ledger_id, due_on, updated_at)
      values ('${ID.todo}', '${ID.samuel}', 'Visit Gatundu', '${ID.miguel}', 'bidii', (now() at time zone 'Africa/Nairobi')::date + 2, now())`);
    const mine = await jobs("samuel");
    expect(mine[0]).toMatchObject({ kind: "task_given", title: "Miguel gave you a task", mins: 0 });
    expect(mine[1]).toMatchObject({ kind: "task", title: "Visit Gatundu", body: "Due today" });
    // Ticking it off removes the due-day reminder.
    await db.exec(`update todos set done_at = now() where id = '${ID.todo}'`);
    expect((await jobs("samuel")).map((j) => j.kind)).toEqual(["task_given"]);
  });

  it("keeps 60 days ahead on the hourly run without anyone opening the app", async () => {
    await addEvent({ repeat: "'weekly'" });
    await db.exec(`delete from reminder_jobs`);
    await db.query(`select roll_reminders()`);
    expect((await jobs()).length).toBeGreaterThanOrEqual(8);
  });

  it("claims due reminders once, and retries a failed send up to 3 times", async () => {
    // A reminder that fell due a minute ago.
    await db.exec(`insert into reminder_jobs (person_id, id, kind, source_id, fire_at, title)
                   values ('${ID.miguel}', 'due-now', 'event', 'x', now() - interval '1 minute', 'Due now')`);
    const claim = async () => (await db.query(`select person_id, id from claim_due_reminders(10)`)).rows;
    const release = async (rows: unknown[]) => (await db.query<{ n: number }>(`select release_reminders($1::jsonb) n`, [JSON.stringify(rows)])).rows[0].n;

    const first = await claim();
    expect(first).toHaveLength(1);
    expect(await claim()).toHaveLength(0); // never sent twice
    expect(await release(first)).toBe(1); // try 1 failed
    expect(await release(await claim())).toBe(1); // try 2 failed
    expect(await release(await claim())).toBe(0); // try 3 failed: give up
    expect(await claim()).toHaveLength(0);
  });
});
