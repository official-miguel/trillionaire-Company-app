// M-PESA payments: runs the real migrations in Postgres (with a stand-in for
// Supabase Vault), sends Daraja-shaped confirmations through mpesa_receive
// and checks what is credited, what is held back, and who is told.
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

let db: PGlite;
const MIGRATIONS = ["0001_phase1", "0002_seed", "0003_request_status", "0004_calendar", "0005_reminder_helpers", "0006_push_reminders", "0008_owner", "0009_mpesa"];
const ID = {
  miguel: "00000000-0000-0000-0000-00000000000a",
  samuel: "00000000-0000-0000-0000-00000000000b",
  romeo: "00000000-0000-0000-0000-00000000000c",
};
const SCHOOL = "20000000-0000-0000-0000-000000000001";
const OTHER_SCHOOL = "20000000-0000-0000-0000-000000000002";
const INV1 = "30000000-0000-0000-0000-000000000001";
const INV2 = "30000000-0000-0000-0000-000000000002";
let token = "";

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    -- Stand-in for Supabase Vault: same functions and view, no encryption.
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
    grant usage on schema public, auth to authenticated;
    grant select, insert, update on all tables in schema public to authenticated;
    grant usage on all sequences in schema public to authenticated;
    grant execute on function mpesa_save_config(boolean, text, text, text, text, text, text, text), mpesa_reconcile(uuid, uuid, uuid, text),
      mpesa_reverse(uuid, text), mpesa_retry_callback(bigint), mark_notifications_read(text[]), has_permission(text, text),
      can_see_ledger(text), is_owner(), is_td_cofounder(), mpesa_ledger() to authenticated;
    grant execute on all functions in schema auth to authenticated;
    insert into auth.users (id) values ('${ID.miguel}'), ('${ID.samuel}'), ('${ID.romeo}');
    insert into people (id, slug, full_name, email, share_class, is_owner, must_change_password) values
      ('${ID.miguel}', 'miguel', 'Miguel Muiruri', 'm@x.co', 'A', true, false),
      ('${ID.samuel}', 'samuel', 'Samuel Kuhia', 's@x.co', 'B', false, false),
      ('${ID.romeo}', 'romeo', 'Romeo Mbote', 'r@x.co', 'A', false, false);
    insert into memberships (person_id, ledger_id, role) values
      ('${ID.miguel}', 'company', 'td_cofounder'), ('${ID.miguel}', 'bidii', 'td_cofounder'),
      ('${ID.romeo}', 'company', 'td_cofounder'), ('${ID.romeo}', 'bidii', 'td_cofounder'),
      ('${ID.samuel}', 'bidii', 'product_cofounder');
    insert into permissions (person_id, ledger_id, permission) values ('${ID.romeo}', 'bidii', 'ledger_editor');
    insert into schools (id, bidii_school_id, name, contact_phone, package, students) values
      ('${SCHOOL}', 'BID-001', 'Thika Road Primary', '0712 345 678', 'termly', 300),
      ('${OTHER_SCHOOL}', 'BID-002', 'Ruiru Academy', '0722 000 111', 'termly', 200);
    insert into invoices (id, number, school_id, ledger_id, kind, period_label, lines, amount, issued_on, due_on) values
      ('${INV1}', 'INV-1001', '${SCHOOL}', 'bidii', 'subscription', 'Term 1 2027', '[]', 45000, '2026-10-01', '2026-10-15'),
      ('${INV2}', 'INV-1002', '${OTHER_SCHOOL}', 'bidii', 'subscription', 'Term 1 2027', '[]', 30000, '2026-10-01', '2026-10-15');
  `);
  await as("miguel", `select mpesa_save_config(true, 'sandbox', '600984', 'paybill', 'key-123', 'secret-456', 'passkey-789', 'Set up M-PESA')`);
  token = (await db.query<{ t: string }>("select callback_token as t from mpesa_credentials()")).rows[0].t;
});

async function as<T>(who: keyof typeof ID, sql: string, params: unknown[] = []): Promise<T[]> {
  await db.exec(`select set_config('test.uid', '${ID[who]}', false); set role authenticated;`);
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec(`reset role; select set_config('test.uid', '', false);`);
  }
}

/** A C2B confirmation as Daraja sends it. */
const confirmation = (over: Record<string, string> = {}) => ({
  TransactionType: "Pay Bill",
  TransID: "SKA1B2C3D4",
  TransTime: "20261106140501",
  TransAmount: "20000.00",
  BusinessShortCode: "600984",
  BillRefNumber: "INV-1001",
  InvoiceNumber: "",
  OrgAccountBalance: "120000.00",
  ThirdPartyTransID: "",
  MSISDN: "254708374149",
  FirstName: "Jane",
  MiddleName: "",
  LastName: "Wanjiru",
  ...over,
});

async function receive(payload: object, t = token) {
  const { rows } = await db.query<{ r: string }>("select mpesa_receive($1, $2::jsonb, '196.201.214.200') as r", [t, JSON.stringify(payload)]);
  return rows[0].r;
}
const tx = async (receipt: string) =>
  (await db.query<{ id: string; status: string; note: string; invoice_id: string; ledger_line_id: string; match_method: string; paid_at: Date }>(
    "select * from mpesa_transactions where receipt = $1", [receipt])).rows[0];
const invoiceStatus = async (id: string) => (await db.query<{ status: string }>("select status from invoices where id = $1", [id])).rows[0].status;
const credited = async (invoice: string) =>
  Number((await db.query<{ s: string }>("select coalesce(sum(amount), 0) as s from ledger_lines where invoice_id = $1", [invoice])).rows[0].s);

describe("settings", () => {
  it("keeps the keys in Vault, never in the table, and only for the server", async () => {
    const [cfg] = await as<Record<string, unknown>>("miguel", "select * from mpesa_config");
    expect(JSON.stringify(cfg)).not.toContain("secret-456");
    expect(cfg.consumer_secret_id).toBeTruthy();
    await expect(as("miguel", "select * from mpesa_credentials()")).rejects.toThrow(/permission denied/);
    expect(token).toMatch(/^[a-f0-9]{64}$/);
  });

  it("can be changed only by the owner or a settings editor, with a reason", async () => {
    await expect(as("samuel", `select mpesa_save_config(true, 'sandbox', '600984', 'paybill', '', '', '', 'x')`)).rejects.toThrow(/owner/);
    await expect(as("miguel", `select mpesa_save_config(true, 'sandbox', '600984', 'paybill', '', '', '', '')`)).rejects.toThrow(/reason/);
    await expect(as("miguel", `select mpesa_save_config(true, 'sandbox', '12', 'paybill', '', '', '', 'x')`)).rejects.toThrow(/5 to 7 digit/);
    expect(await as("samuel", "select * from mpesa_config")).toEqual([]);
  });

  it("keeps the saved keys when the boxes are left blank", async () => {
    await as("miguel", `select mpesa_save_config(true, 'sandbox', '600984', 'paybill', '', '', '', 'No change to keys')`);
    const { rows } = await db.query<{ consumer_secret: string; callback_token: string }>("select * from mpesa_credentials()");
    expect(rows[0]).toMatchObject({ consumer_secret: "secret-456", callback_token: token });
  });
});

describe("a payment from Safaricom", () => {
  it("is refused without the secret from the callback address, and nothing is stored", async () => {
    expect(await receive(confirmation({ TransID: "SKAFAKE001" }), "0".repeat(64))).toBe("rejected");
    expect(await tx("SKAFAKE001")).toBeUndefined();
  });

  it("is matched to the invoice in the account number, credited and the invoice part paid", async () => {
    expect(await receive(confirmation())).toBe("accepted");
    const t = await tx("SKA1B2C3D4");
    expect(t).toMatchObject({ status: "matched", match_method: "invoice", invoice_id: INV1 });
    expect(t.ledger_line_id).toBeTruthy();
    expect(t.paid_at.toISOString()).toBe("2026-11-06T11:05:01.000Z"); // 14:05 in Nairobi
    expect(await credited(INV1)).toBe(20000);
    expect(await invoiceStatus(INV1)).toBe("part_paid");
    const [line] = (await db.query<{ type: string; status: string; school_id: string }>(`select type, status, school_id from ledger_lines where id = $1`, [t.ledger_line_id])).rows;
    expect(line).toEqual({ type: "money_in", status: "reconciled", school_id: SCHOOL });
  });

  it("sent again is never credited twice", async () => {
    expect(await receive(confirmation())).toBe("accepted");
    expect(await receive(confirmation({ TransAmount: "99999" }))).toBe("accepted");
    expect(await credited(INV1)).toBe(20000);
    const { rows } = await db.query<{ status: string }>("select status from mpesa_callbacks where payload->>'TransID' = 'SKA1B2C3D4' order by id");
    expect(rows.map((r) => r.status)).toEqual(["processed", "duplicate", "duplicate"]);
  });

  it("tells everyone who can see Bidii, with the payer, amount, receipt and status", async () => {
    const { rows } = await db.query<{ slug: string; title: string; body: string; url: string; data: { receipt: string; status: string; amount: number } }>(
      `select p.slug, j.title, j.body, j.url, j.data from reminder_jobs j join people p on p.id = j.person_id
        where j.kind = 'payment' and j.data->>'receipt' = 'SKA1B2C3D4' order by p.slug`);
    expect(rows.map((r) => r.slug)).toEqual(["miguel", "romeo", "samuel"]);
    expect(rows[0].title).toBe("M-PESA payment received and reconciled");
    expect(rows[0].body).toContain("KES 20,000 from Thika Road Primary · SKA1B2C3D4 · 06 Nov 14:05");
    expect(rows[0].data).toMatchObject({ receipt: "SKA1B2C3D4", status: "matched", amount: 20000 });
    const t = await tx("SKA1B2C3D4");
    expect(rows[0].url).toBe(`/payments/${t.id}`);
  });

  it("paying the rest by the school's Bidii id settles the invoice", async () => {
    await receive(confirmation({ TransID: "SKA1B2C3D5", TransAmount: "25000", BillRefNumber: "bid-001" }));
    expect(await tx("SKA1B2C3D5")).toMatchObject({ status: "matched", match_method: "school", invoice_id: INV1 });
    expect(await invoiceStatus(INV1)).toBe("paid");
  });

  it("is matched by the school's phone when there is no account number, also when hashed", async () => {
    const hashed = (await db.query<{ h: string }>("select encode(sha256(convert_to('254722000111', 'UTF8')), 'hex') as h")).rows[0].h;
    await receive(confirmation({ TransID: "SKA1B2C3D6", TransAmount: "1000", BillRefNumber: "", MSISDN: hashed }));
    expect(await tx("SKA1B2C3D6")).toMatchObject({ status: "matched", match_method: "phone", invoice_id: INV2 });
  });

  it("that pays more than the invoice owes is held for review, not credited", async () => {
    await receive(confirmation({ TransID: "SKA1B2C3D7", TransAmount: "50000", BillRefNumber: "INV-1002" }));
    const t = await tx("SKA1B2C3D7");
    expect(t).toMatchObject({ status: "review", invoice_id: INV2, ledger_line_id: null });
    expect(t.note).toMatch(/owes KES 29,000/);
  });

  it("to an invoice already paid, or to the wrong shortcode, is held for review", async () => {
    await receive(confirmation({ TransID: "SKA1B2C3D8", TransAmount: "100", BillRefNumber: "INV-1001" }));
    expect(await tx("SKA1B2C3D8")).toMatchObject({ status: "review", note: "Invoice INV-1001 is already paid." });
    await receive(confirmation({ TransID: "SKA1B2C3D9", BusinessShortCode: "111111" }));
    expect((await tx("SKA1B2C3D9")).note).toMatch(/shortcode 111111/);
  });

  it("that matches nothing is kept as unmatched, and people are told", async () => {
    await receive(confirmation({ TransID: "SKA1B2C3E1", TransAmount: "700", BillRefNumber: "HELLO", MSISDN: "254700000000" }));
    expect(await tx("SKA1B2C3E1")).toMatchObject({ status: "unmatched", ledger_line_id: null });
    const { rows } = await db.query<{ title: string }>(`select distinct title from reminder_jobs where data->>'receipt' = 'SKA1B2C3E1'`);
    expect(rows).toEqual([{ title: "M-PESA payment received, not matched" }]);
  });

  it("that is incomplete is stored as a failed callback, and people are told once", async () => {
    await receive({ TransAmount: "10" });
    const { rows } = await db.query<{ id: number; status: string; error: string }>("select id, status, error from mpesa_callbacks where payload->>'TransID' is null");
    expect(rows[0]).toMatchObject({ status: "failed" });
    expect(rows[0].error).toMatch(/receipt number/);
    await db.query("select mpesa_try_callback($1)", [rows[0].id]);
    const notices = await db.query("select 1 from reminder_jobs where id = $1", [`mpesa-callback:${rows[0].id}`]);
    expect(notices.rows.length).toBe(3); // once for each of the three people
  });

  it("stored but not processed is picked up again by the retry", async () => {
    await db.query(`insert into mpesa_callbacks (payload, received_at) values ($1::jsonb, now() - interval '10 minutes')`, [
      JSON.stringify(confirmation({ TransID: "SKA1B2C3E2", TransAmount: "300", BillRefNumber: "INV-1002" })),
    ]);
    expect((await db.query<{ n: number }>("select mpesa_retry_callbacks() as n")).rows[0].n).toBe(1);
    expect(await tx("SKA1B2C3E2")).toMatchObject({ status: "matched" });
  });
});

describe("reconciling by hand", () => {
  it("is only for people who can edit the ledger, with a reason", async () => {
    const t = await tx("SKA1B2C3E1");
    await expect(as("samuel", `select mpesa_reconcile('${t.id}', '${INV2}', null, 'Their bursar')`)).rejects.toThrow(/edit the ledger/);
    await expect(as("romeo", `select mpesa_reconcile('${t.id}', '${INV2}', null, '')`)).rejects.toThrow(/reason/);
  });

  it("credits the chosen invoice, records who did it and tells the others", async () => {
    const t = await tx("SKA1B2C3E1");
    const before = await credited(INV2);
    await as("romeo", `select mpesa_reconcile('${t.id}', '${INV2}', null, 'Their bursar paid from her own phone')`);
    expect(await tx("SKA1B2C3E1")).toMatchObject({ status: "matched", match_method: "manual", invoice_id: INV2 });
    expect(await credited(INV2)).toBe(before + 700);
    const trail = await as<{ action: string; actor_id: string }>("samuel", `select action, actor_id from audit_log where subject_id = '${t.id}' order by id`);
    expect(trail).toEqual([
      { action: "mpesa_received", actor_id: null },
      { action: "mpesa_reconciled", actor_id: ID.romeo },
    ]);
    const told = await db.query<{ slug: string }>(
      `select p.slug from reminder_jobs j join people p on p.id = j.person_id where j.title = 'M-PESA payment reconciled' order by p.slug`);
    expect(told.rows.map((r) => r.slug)).toEqual(["miguel", "samuel"]);
    await expect(as("romeo", `select mpesa_reconcile('${t.id}', '${INV2}', null, 'Again')`)).rejects.toThrow(/already reconciled/);
  });

  it("a reversal takes the money back off the invoice with a refund line", async () => {
    const t = await tx("SKA1B2C3D5");
    await as("romeo", `select mpesa_reverse('${t.id}', 'Paid twice by mistake; refunded on M-PESA')`);
    expect(await tx("SKA1B2C3D5")).toMatchObject({ status: "reversed" });
    expect(await credited(INV1)).toBe(20000);
    expect(await invoiceStatus(INV1)).toBe("part_paid");
  });
});

describe("the bell", () => {
  it("marks one, then all, of your own notifications read", async () => {
    const unread = async () =>
      (await as<{ n: number }>("samuel", "select count(*)::int as n from reminder_jobs where read_at is null and kind in ('notice', 'payment', 'task_given')"))[0].n;
    const total = await unread();
    expect(total).toBeGreaterThan(2);
    const [first] = await as<{ id: string }>("samuel", "select id from reminder_jobs where kind = 'payment' limit 1");
    await as("samuel", `select mark_notifications_read(array['${first.id}'])`);
    expect(await unread()).toBe(total - 1);
    await as("samuel", "select mark_notifications_read(null)");
    expect(await unread()).toBe(0);
    // Someone else's are untouched.
    expect((await as<{ n: number }>("miguel", "select count(*)::int as n from reminder_jobs where read_at is null and kind = 'payment'"))[0].n).toBeGreaterThan(0);
  });

  it("nobody can write payments or change their status directly", async () => {
    await expect(as("romeo", `insert into mpesa_transactions (receipt, ledger_id, paid_at, amount, status) values ('FAKE00001', 'bidii', now(), 5000, 'matched')`)).rejects.toThrow(/row-level security/);
    const t = await tx("SKA1B2C3D7");
    await as("romeo", `update mpesa_transactions set status = 'matched' where id = '${t.id}'`);
    expect((await tx("SKA1B2C3D7")).status).toBe("review");
  });
});
