// Security: runs the real migrations in Postgres, then acts as each person
// (row level security switched on, as Supabase does for signed-in users) and
// checks they can see and do only what their role allows.
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

let db: PGlite;
const MIGRATIONS = ["0001_phase1", "0002_seed", "0003_request_status", "0004_calendar", "0005_reminder_helpers", "0006_push_reminders"];
const ID = {
  miguel: "00000000-0000-0000-0000-00000000000a",
  samuel: "00000000-0000-0000-0000-00000000000b",
  romeo: "00000000-0000-0000-0000-00000000000c",
};

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  `);
  for (const m of MIGRATIONS) {
    await db.exec(readFileSync(`supabase/migrations/${m}.sql`, "utf8").replace("create extension if not exists pgcrypto;", ""));
  }
  // What Supabase grants signed-in users; row level security does the rest.
  await db.exec(`
    grant usage on schema public, auth to authenticated;
    grant select, insert, update on all tables in schema public to authenticated;
    grant usage on all sequences in schema public to authenticated;
    grant execute on all functions in schema public, auth to authenticated;
    insert into auth.users (id) values ('${ID.miguel}'), ('${ID.samuel}'), ('${ID.romeo}');
    insert into people (id, slug, full_name, email, share_class, must_change_password) values
      ('${ID.miguel}', 'miguel', 'Miguel Muiruri', 'm@x.co', 'A', false),
      ('${ID.samuel}', 'samuel', 'Samuel Kuhia', 's@x.co', 'B', false),
      ('${ID.romeo}', 'romeo', 'Romeo Mbote', 'r@x.co', 'A', false);
    insert into memberships (person_id, ledger_id, role) values
      ('${ID.miguel}', 'company', 'td_cofounder'), ('${ID.miguel}', 'bidii', 'td_cofounder'),
      ('${ID.romeo}', 'company', 'td_cofounder'), ('${ID.romeo}', 'bidii', 'td_cofounder'),
      ('${ID.samuel}', 'bidii', 'product_cofounder');
    insert into permissions (person_id, ledger_id, permission, limit_kes) values
      ('${ID.romeo}', 'bidii', 'approver', 20000), ('${ID.romeo}', 'bidii', 'ledger_editor', null),
      ('${ID.miguel}', 'bidii', 'task_assigner', null);
    insert into ledger_lines (ledger_id, occurred_on, type, pot_id, amount, description, status) values
      ('company', '2026-10-05', 'bill', 'company.fee', -6500, 'Accountant', 'approved'),
      ('bidii', '2026-10-03', 'money_in', null, 69000, 'Thika Road Primary', 'approved');
    insert into calendar_events (id, owner_id, title, starts_at, ends_at, calendar, invitees, updated_at) values
      ('10000000-0000-0000-0000-000000000001', '${ID.miguel}', 'Board call', now() + interval '1 day', now() + interval '1 day 1 hour', 'company', array['${ID.samuel}']::uuid[], now()),
      ('10000000-0000-0000-0000-000000000002', '${ID.miguel}', 'School visit', now() + interval '1 day', now() + interval '1 day 1 hour', 'bidii', array['${ID.samuel}']::uuid[], now()),
      ('10000000-0000-0000-0000-000000000003', '${ID.miguel}', 'Dentist', now() + interval '1 day', now() + interval '1 day 1 hour', 'personal', '{}', now());
  `);
});

/** Runs SQL as a signed-in person, with row level security on. */
async function as<T>(who: keyof typeof ID, sql: string, params: unknown[] = []): Promise<T[]> {
  await db.exec(`select set_config('test.uid', '${ID[who]}', false); set role authenticated;`);
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec(`reset role; select set_config('test.uid', '', false);`);
  }
}

describe("what a Bidii co-founder (Class B) can see", () => {
  it("sees Bidii's ledger but never Trillionaire Designs' money", async () => {
    const lines = await as<{ ledger_id: string }>("samuel", "select ledger_id from ledger_lines");
    expect(lines.map((l) => l.ledger_id)).toEqual(["bidii"]);
    expect(await as("samuel", "select id from ledgers where id = 'company'")).toEqual([]);
    expect(await as("samuel", "select id from pots where class_a_only")).toEqual([]);
  });

  it("does not see a Trillionaire Designs event even when invited, or anyone's personal events", async () => {
    const titles = (await as<{ title: string }>("samuel", "select title from calendar_events")).map((e) => e.title);
    expect(titles).toEqual(["School visit"]);
  });

  it("cannot put a calendar event on the Trillionaire Designs calendar", async () => {
    await expect(
      as("samuel", `insert into calendar_events (id, owner_id, title, starts_at, ends_at, calendar, updated_at)
                    values (gen_random_uuid(), '${ID.samuel}', 'x', now(), now(), 'company', now())`),
    ).rejects.toThrow(/row-level security/);
  });

  it("can ask for money from a Bidii pot, but not from a Class A pot", async () => {
    await as("samuel", `insert into requests (ledger_id, pot_id, requester_id, amount, purpose) values ('bidii', 'bidii.growth', '${ID.samuel}', 8500, 'Matatu')`);
    await expect(
      as("samuel", `insert into requests (ledger_id, pot_id, requester_id, amount, purpose) values ('bidii', 'company.fee', '${ID.samuel}', 8500, 'x')`),
    ).rejects.toThrow(/row-level security/);
  });

  it("cannot approve, record a fake approval, or add ledger lines", async () => {
    const [req] = await as<{ id: string }>("samuel", "select id from requests limit 1");
    await expect(as("samuel", `insert into approvals (subject_type, subject_id, person_id, decision) values ('request', '${req.id}', '${ID.samuel}', 'approve')`)).rejects.toThrow();
    await expect(as("samuel", `insert into ledger_lines (ledger_id, occurred_on, type, amount, description) values ('bidii', '2026-10-14', 'money_in', 1, 'x')`)).rejects.toThrow(/row-level security/);
  });

  it("cannot give tasks without the permission", async () => {
    await expect(
      as("samuel", `insert into todos (id, owner_id, title, assigned_by, ledger_id, updated_at) values (gen_random_uuid(), '${ID.romeo}', 'x', '${ID.samuel}', 'bidii', now())`),
    ).rejects.toThrow(/row-level security/);
  });

  it("cannot change people, roles or permissions", async () => {
    await as("samuel", `update people set share_class = 'A' where id = '${ID.samuel}'`);
    await expect(as("samuel", `insert into permissions (person_id, ledger_id, permission) values ('${ID.samuel}', 'bidii', 'approver')`)).rejects.toThrow(/row-level security/);
    const [me] = await as<{ share_class: string }>("samuel", `select share_class from people where id = '${ID.samuel}'`);
    expect(me.share_class).toBe("B");
  });
});

describe("approvals", () => {
  it("lets an approver approve, but never their own request", async () => {
    const [req] = await as<{ id: string }>("romeo", "select id from requests where amount = 8500");
    await as("romeo", `insert into approvals (subject_type, subject_id, person_id, decision) values ('request', '${req.id}', '${ID.romeo}', 'approve')`);
    await as("romeo", `select set_request_status('${req.id}', 'approved')`);
    const [r] = await as<{ status: string }>("romeo", `select status from requests where id = '${req.id}'`);
    expect(r.status).toBe("approved");

    await as("romeo", `insert into requests (ledger_id, pot_id, requester_id, amount, purpose) values ('bidii', 'bidii.growth', '${ID.romeo}', 5000, 'Own')`);
    const [own] = await as<{ id: string }>("romeo", "select id from requests where purpose = 'Own'");
    await expect(as("romeo", `insert into approvals (subject_type, subject_id, person_id, decision) values ('request', '${own.id}', '${ID.romeo}', 'approve')`)).rejects.toThrow(/own request/);
  });
});

describe("ledger history", () => {
  it("never deletes a line and keeps the old value with the reason", async () => {
    await expect(as("romeo", "delete from ledger_lines where ledger_id = 'bidii'")).rejects.toThrow();
    const [line] = await as<{ id: string }>("romeo", "select id from ledger_lines where ledger_id = 'bidii'");
    await expect(as("romeo", `update ledger_lines set amount = 1 where id = '${line.id}'`)).rejects.toThrow(/reason/);
    await as("romeo", `select update_ledger_line('${line.id}', '{"amount": 70000}'::jsonb, 'Bank showed 70,000')`);
    const hist = await as<{ reason: string; old: string }>("romeo", `select reason, old_row->>'amount' as old from ledger_line_history where line_id = '${line.id}'`);
    expect(hist).toEqual([{ reason: "Bank showed 70,000", old: "69000" }]);
  });
});
