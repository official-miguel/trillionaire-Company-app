// The real callback route, end to end: Daraja-shaped HTTP requests go to the
// route handler, whose Supabase calls run against Postgres with the real
// migrations (a stand-in for Supabase Vault, as in mpesa.test.ts).
import { readFileSync } from "node:fs";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { PGlite } from "@electric-sql/pglite";

const state = vi.hoisted(() => ({ db: null as PGlite | null, failRpc: false }));

vi.mock("server-only", () => ({}));
// The service-role client, answered by the test database.
vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: () => ({
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (state.failRpc) return { data: null, error: { message: "connection lost" } };
      const keys = Object.keys(args);
      const values = keys.map((k) => (args[k] !== null && typeof args[k] === "object" ? JSON.stringify(args[k]) : args[k]));
      try {
        const { rows } = await state.db!.query<{ r: unknown }>(`select public.${name}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as r`, values);
        return { data: rows[0].r, error: null };
      } catch (e) {
        return { data: null, error: { message: (e as Error).message } };
      }
    },
  }),
}));

const { POST } = await import("@/app/api/payments/c2b/[token]/[kind]/route");

const MIGRATIONS = ["0001_phase1", "0002_seed", "0003_request_status", "0004_calendar", "0005_reminder_helpers", "0006_push_reminders", "0008_owner", "0009_mpesa"];
const OWNER = "00000000-0000-0000-0000-00000000000a";
const INVOICE = "30000000-0000-0000-0000-000000000001";
let token = "";

beforeAll(async () => {
  const db = new PGlite();
  state.db = db;
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create schema vault;
    create table vault.secrets (id uuid primary key default gen_random_uuid(), name text unique, secret text);
    create view vault.decrypted_secrets as select id, name, secret as decrypted_secret from vault.secrets;
    create function vault.create_secret(new_secret text, new_name text default null) returns uuid language sql as $$
      insert into vault.secrets (name, secret) values (new_name, new_secret) returning id $$;
    create function vault.update_secret(secret_id uuid, new_secret text default null) returns void language sql as $$
      update vault.secrets set secret = coalesce(new_secret, secret) where id = secret_id $$;
  `);
  for (const m of MIGRATIONS) {
    await db.exec(readFileSync(`supabase/migrations/${m}.sql`, "utf8").replace("create extension if not exists pgcrypto;", ""));
  }
  await db.exec(`
    insert into auth.users (id) values ('${OWNER}');
    insert into people (id, slug, full_name, email, share_class, is_owner, must_change_password)
      values ('${OWNER}', 'miguel', 'Miguel Muiruri', 'm@x.co', 'A', true, false);
    insert into memberships (person_id, ledger_id, role) values ('${OWNER}', 'bidii', 'td_cofounder');
    insert into schools (id, bidii_school_id, name, package, students)
      values ('20000000-0000-0000-0000-000000000001', 'BID-001', 'Thika Road Primary', 'termly', 300);
    insert into invoices (id, number, school_id, ledger_id, kind, period_label, lines, amount, issued_on, due_on)
      values ('${INVOICE}', 'INV-1001', '20000000-0000-0000-0000-000000000001', 'bidii', 'subscription', 'Term 1 2027', '[]', 45000, '2026-10-01', '2026-10-15');
    select set_config('test.uid', '${OWNER}', false);
    select mpesa_save_config(true, 'sandbox', '600984', 'paybill', 'key', 'secret', '', 'Set up');
    select set_config('test.uid', '', false);
  `);
  token = (await db.query<{ t: string }>("select callback_token as t from mpesa_credentials()")).rows[0].t;
});

afterEach(() => {
  state.failRpc = false;
  vi.unstubAllEnvs();
});

const confirmation = (over: Record<string, string> = {}) => ({
  TransactionType: "Pay Bill",
  TransID: "TRT0000001",
  TransTime: "20261122093000",
  TransAmount: "10000.00",
  BusinessShortCode: "600984",
  BillRefNumber: "INV-1001",
  InvoiceNumber: "",
  OrgAccountBalance: "",
  ThirdPartyTransID: "",
  MSISDN: "254708374149",
  FirstName: "Jane",
  MiddleName: "",
  LastName: "Wanjiru",
  ...over,
});

async function post(kind: string, body: unknown, opts: { secret?: string; ip?: string; raw?: string } = {}) {
  const secret = opts.secret ?? token;
  const req = new NextRequest(`https://app.example.com/api/payments/c2b/${secret}/${kind}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": opts.ip ?? "196.201.214.200" },
    body: opts.raw ?? JSON.stringify(body),
  });
  const res = await POST(req, { params: Promise.resolve({ token: secret, kind }) });
  const text = await res.text();
  return { status: res.status, body: text.startsWith("{") ? JSON.parse(text) : text };
}

const credited = async () =>
  Number((await state.db!.query<{ s: string }>(`select coalesce(sum(amount), 0) as s from ledger_lines where invoice_id = '${INVOICE}'`)).rows[0].s);
const callbacks = async () => Number((await state.db!.query<{ n: number }>("select count(*)::int as n from mpesa_callbacks")).rows[0].n);

describe("the M-PESA callback route", () => {
  it("records a confirmation, credits the invoice and answers Safaricom with ResultCode 0", async () => {
    const res = await post("confirmation", confirmation());
    expect(res).toEqual({ status: 200, body: { ResultCode: 0, ResultDesc: "Accepted" } });
    const { rows } = await state.db!.query<{ status: string; source_ip: string }>(
      "select t.status, c.source_ip from mpesa_transactions t join mpesa_callbacks c on c.id = t.callback_id where t.receipt = 'TRT0000001'");
    expect(rows).toEqual([{ status: "matched", source_ip: "196.201.214.200" }]);
    expect(await credited()).toBe(10000);
  });

  it("answers a repeat with ResultCode 0 and never credits it twice", async () => {
    expect((await post("confirmation", confirmation())).status).toBe(200);
    expect(await credited()).toBe(10000);
  });

  it("refuses a wrong secret with 404 and stores nothing", async () => {
    const before = await callbacks();
    const res = await post("confirmation", confirmation({ TransID: "TRT0000002" }), { secret: "f".repeat(64) });
    expect(res.status).toBe(404);
    expect(await callbacks()).toBe(before);
  });

  it("returns 404 for a malformed secret or an unknown endpoint", async () => {
    expect((await post("confirmation", confirmation(), { secret: "short" })).status).toBe(404);
    expect((await post("anything", confirmation())).status).toBe(404);
  });

  it("accepts validation with the right secret only, and stores nothing", async () => {
    const before = await callbacks();
    expect(await post("validation", confirmation({ TransID: "TRT0000003" }))).toEqual({ status: 200, body: { ResultCode: 0, ResultDesc: "Accepted" } });
    expect((await post("validation", confirmation(), { secret: "e".repeat(64) })).status).toBe(404);
    expect(await callbacks()).toBe(before);
  });

  it("keeps a body that isn't JSON as a failed callback, still answering 200", async () => {
    const res = await post("confirmation", null, { raw: "not json at all" });
    expect(res.status).toBe(200);
    const { rows } = await state.db!.query<{ status: string; payload: { _unreadable: string } }>("select status, payload from mpesa_callbacks order by id desc limit 1");
    expect(rows[0]).toMatchObject({ status: "failed", payload: { _unreadable: "not json at all" } });
  });

  it("refuses callers outside DARAJA_ALLOWED_IPS when it is set", async () => {
    vi.stubEnv("DARAJA_ALLOWED_IPS", "196.201.214.200, 196.201.214.206");
    expect((await post("confirmation", confirmation({ TransID: "TRT0000004" }), { ip: "41.90.1.1" })).status).toBe(403);
    expect((await post("confirmation", confirmation({ TransID: "TRT0000004", TransAmount: "500" }), { ip: "196.201.214.206" })).status).toBe(200);
    expect(await credited()).toBe(10500);
  });

  it("answers 500 if the database can't be reached, so nothing is silently lost", async () => {
    state.failRpc = true;
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await post("confirmation", confirmation({ TransID: "TRT0000005" }));
    expect(res).toEqual({ status: 500, body: { ResultCode: 1, ResultDesc: "Temporarily unavailable" } });
    expect(spy.mock.calls[0].join(" ")).toContain("TRT0000005"); // the payload is in the log to recover it
    spy.mockRestore();
  });

  it("refuses a body over 20 KB", async () => {
    expect((await post("confirmation", null, { raw: "x".repeat(20_001) })).status).toBe(413);
  });
});
