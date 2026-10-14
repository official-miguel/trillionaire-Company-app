// Applies supabase/migrations/*.sql in order, once each.
// Needs SUPABASE_DB_URL in .env.local (the Postgres connection string).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

process.loadEnvFile?.(".env.local");
const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("Add SUPABASE_DB_URL to .env.local first (Supabase → Project Settings → Database).");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
await client.query(`create table if not exists public._migrations (name text primary key, applied_at timestamptz default now());
  alter table public._migrations enable row level security;`);
const done = new Set((await client.query("select name from public._migrations")).rows.map((r) => r.name));

const dir = "supabase/migrations";
for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
  if (done.has(file)) continue;
  process.stdout.write(`Applying ${file} ... `);
  try {
    await client.query("begin");
    await client.query(readFileSync(join(dir, file), "utf8"));
    await client.query("insert into public._migrations (name) values ($1)", [file]);
    await client.query("commit");
    console.log("done");
  } catch (e) {
    await client.query("rollback");
    console.log("failed");
    console.error(e.message);
    process.exit(1);
  }
}

// The reminder schedule reads these from Supabase Vault (encrypted), so they
// are never written into a migration file.
const vault = {
  project_url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  reminders_cron_secret: process.env.REMINDERS_CRON_SECRET,
};
for (const [name, value] of Object.entries(vault)) {
  if (!value) continue;
  const { rows } = await client.query("select id from vault.secrets where name = $1", [name]);
  if (rows.length) await client.query("select vault.update_secret($1, $2)", [rows[0].id, value]);
  else await client.query("select vault.create_secret($1, $2)", [value, name]);
  console.log(`Stored ${name} in Supabase Vault`);
}
await client.end();
