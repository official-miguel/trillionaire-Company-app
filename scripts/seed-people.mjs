// Adds the first people to the app from a local list (people.local.json,
// which git ignores because it holds emails and phone numbers).
// Run after `npm run migrate`:   npm run seed-people
//
// Each person gets a random temporary password nobody needs to know: Bidii
// super admins sign in with their Bidii password the first time (the app
// checks it with Bidii), everyone else gets a password reset from People.
// People already in the app are skipped, so it is safe to run again.
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

process.loadEnvFile?.(".env.local");
const file = process.argv[2] ?? "people.local.json";
const list = JSON.parse(readFileSync(file, "utf8"));

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: ledgers, error: ledgerError } = await sb.from("ledgers").select("id");
if (ledgerError) {
  console.error("Run `npm run migrate` first:", ledgerError.message);
  process.exit(1);
}
const allLedgers = ledgers.map((l) => l.id);
const toE164 = (raw) => {
  const d = (raw ?? "").replace(/[^\d+]/g, "");
  if (/^0[17]\d{8}$/.test(d)) return `+254${d.slice(1)}`;
  if (/^254[17]\d{8}$/.test(d)) return `+${d}`;
  return raw || null;
};

for (const p of list) {
  const email = p.email.trim().toLowerCase();
  const { data: existing } = await sb.from("people").select("id").eq("email", email).maybeSingle();
  if (existing) {
    console.log(`Skipped ${p.name}: already in the app`);
    continue;
  }

  const { data: created, error } = await sb.auth.admin.createUser({
    email,
    password: randomBytes(24).toString("base64url"),
    email_confirm: true,
    user_metadata: { full_name: p.name },
  });
  if (error) {
    console.error(`${p.name}: ${error.message}`);
    process.exit(1);
  }
  const id = created.user.id;
  const visible = p.role === "td_cofounder" || p.role === "accountant" ? allLedgers : ["bidii"];

  const steps = [
    () => sb.from("people").insert({ id, slug: p.slug, full_name: p.name, email, phone: toE164(p.phone), share_class: p.shareClass ?? null, timezone: p.timezone ?? "Africa/Nairobi", must_change_password: true }),
    () => sb.from("memberships").insert(visible.map((ledger_id) => ({ person_id: id, ledger_id, role: p.role }))),
    () =>
      Object.keys(p.permissions ?? {}).length
        ? sb.from("permissions").insert(
            Object.entries(p.permissions).flatMap(([ledger_id, perms]) =>
              perms.map((permission) => ({ person_id: id, ledger_id, permission, limit_kes: permission === "approver" ? (p.approverLimit ?? 20000) : null })),
            ),
          )
        : { error: null },
    () => (p.shareParts ? sb.from("share_register").insert({ holder_id: id, share_class: p.shareClass, parts: p.shareParts, issued: true }) : { error: null }),
  ];
  for (const step of steps) {
    const { error: e } = await step();
    if (e) {
      // Undo this person completely so the script can simply be run again.
      await sb.from("share_register").delete().eq("holder_id", id);
      await sb.from("permissions").delete().eq("person_id", id);
      await sb.from("memberships").delete().eq("person_id", id);
      await sb.from("people").delete().eq("id", id);
      await sb.auth.admin.deleteUser(id);
      console.error(`${p.name}: ${e.message}`);
      process.exit(1);
    }
  }
  console.log(`Added ${p.name} (${email})`);
}
