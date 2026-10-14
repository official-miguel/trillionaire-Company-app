// The owner can change Settings and roles; nobody else can unless the owner
// gives them that role. Runs the real migrations with row level security on.
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

let db: PGlite;
const MIGRATIONS = ["0001_phase1", "0002_seed", "0003_request_status", "0004_calendar", "0005_reminder_helpers", "0006_push_reminders", "0008_owner"];
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
  await db.exec(`
    grant usage on schema public, auth to authenticated;
    grant select, insert, update on all tables in schema public to authenticated;
    grant usage on all sequences in schema public to authenticated;
    grant execute on all functions in schema public, auth to authenticated;
    insert into auth.users (id) values ('${ID.miguel}'), ('${ID.samuel}'), ('${ID.romeo}');
    insert into people (id, slug, full_name, email, share_class, is_owner, must_change_password) values
      ('${ID.miguel}', 'miguel', 'Miguel Muiruri', 'm@x.co', 'A', true, false),
      ('${ID.samuel}', 'samuel', 'Samuel Kuhia', 's@x.co', 'B', false, false),
      ('${ID.romeo}', 'romeo', 'Romeo Mbote', 'r@x.co', 'A', false, false);
    insert into memberships (person_id, ledger_id, role) values
      ('${ID.miguel}', 'company', 'td_cofounder'), ('${ID.miguel}', 'bidii', 'td_cofounder'),
      ('${ID.romeo}', 'company', 'td_cofounder'), ('${ID.romeo}', 'bidii', 'td_cofounder'),
      ('${ID.samuel}', 'bidii', 'product_cofounder');
  `);
});

async function as<T>(who: keyof typeof ID, sql: string, params: unknown[] = []): Promise<T[]> {
  await db.exec(`select set_config('test.uid', '${ID[who]}', false); set role authenticated;`);
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec(`reset role; select set_config('test.uid', '', false);`);
  }
}

const weights = JSON.stringify({ miguel: 40, romeo: 22, samuel: 16, ruth: 15, larmeck: 15 });

describe("the owner", () => {
  it("changes a setting at once, keeps the old one, and tells everyone", async () => {
    await as("miguel", `select change_setting('bidii', 'weights', $1::jsonb, 'Samuel leads field sales', 'the team pool weights')`, [weights]);
    const rows = await as<{ status: string; value: { samuel: number } }>("miguel", `select status, value from settings where ledger_id = 'bidii' and key = 'weights' order by created_at`);
    expect(rows.map((r) => r.status)).toEqual(["superseded", "active"]);
    expect(rows[1].value.samuel).toBe(16);

    const notices = await db.query<{ slug: string; title: string; body: string }>(
      `select p.slug, j.title, j.body from reminder_jobs j join people p on p.id = j.person_id where j.kind = 'notice' order by p.slug`,
    );
    expect(notices.rows).toEqual([
      { slug: "romeo", title: "Miguel changed the team pool weights", body: "Samuel leads field sales" },
      { slug: "samuel", title: "Miguel changed the team pool weights", body: "Samuel leads field sales" },
    ]);
  });

  it("must give a reason, and a split must add up to 100%", async () => {
    await expect(as("miguel", `select change_setting('bidii', 'weights', $1::jsonb, '', 'x')`, [weights])).rejects.toThrow(/reason/);
    const bad = JSON.stringify({ pool: 0.3, payout: 0.2, fee: 0.1, growth: 0.2, product: 0.1, reserve: 0.2 });
    await expect(as("miguel", `select change_setting('bidii', 'split', $1::jsonb, 'Try', 'x')`, [bad])).rejects.toThrow(/100%/);
  });

  it("is the only one who can change Settings or roles at first", async () => {
    await expect(as("romeo", `select change_setting('bidii', 'weights', $1::jsonb, 'x', 'x')`, [weights])).rejects.toThrow(/owner/);
    await expect(as("samuel", `select change_setting('bidii', 'weights', $1::jsonb, 'x', 'x')`, [weights])).rejects.toThrow(/owner/);
    await expect(as("romeo", `select set_permissions('${ID.samuel}', '[]'::jsonb)`)).rejects.toThrow(/owner/);
  });

  it("can let someone edit Bidii's settings, and only Bidii's", async () => {
    await as("miguel", `select set_permissions('${ID.samuel}', '[{"ledgerId":"bidii","permission":"settings_editor"},{"ledgerId":"company","permission":"settings_editor"}]'::jsonb)`);
    const perms = await as<{ ledger_id: string }>("miguel", `select ledger_id from permissions where person_id = '${ID.samuel}'`);
    expect(perms.map((p) => p.ledger_id)).toEqual(["bidii"]); // not in the company, so not given there
    await as("samuel", `select change_setting('bidii', 'reserve', '{"targetMonths": 5}'::jsonb, 'Smaller reserve for now', 'the reserve target')`);
    await expect(as("samuel", `select change_setting('company', 'x', '{}'::jsonb, 'x', 'x')`)).rejects.toThrow(/owner/);
  });

  it("always keeps every permission", async () => {
    await expect(as("miguel", `select set_permissions('${ID.miguel}', '[]'::jsonb)`)).rejects.toThrow(/always/);
    const [r] = await as<{ ok: boolean }>("miguel", `select has_permission('company', 'people_admin') and has_permission('bidii', 'month_closer') as ok`);
    expect(r.ok).toBe(true);
  });
});
