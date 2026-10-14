// Creates the first person, who can then add everyone else from the People
// page (like Bidii's seed-super-admin script). Run once after `npm run migrate`:
//   npm run create-owner -- --name "Miguel Muiruri" --email you@example.com --password "temporary-pass"
// They must choose their own password at first sign-in.
import { createClient } from "@supabase/supabase-js";
import { parseArgs } from "node:util";

process.loadEnvFile?.(".env.local");
const { values } = parseArgs({ options: { name: { type: "string" }, email: { type: "string" }, password: { type: "string" }, phone: { type: "string" } } });
if (!values.name || !values.email || !values.password || values.password.length < 8) {
  console.error('Usage: npm run create-owner -- --name "Full Name" --email you@example.com --password "at-least-8-chars"');
  process.exit(1);
}

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { count } = await sb.from("people").select("*", { count: "exact", head: true });
if (count) {
  console.error("People already exist. Add more from the People page in the app.");
  process.exit(1);
}

const email = values.email.trim().toLowerCase();
const { data, error } = await sb.auth.admin.createUser({ email, password: values.password, email_confirm: true });
if (error) {
  console.error(error.message);
  process.exit(1);
}
const id = data.user.id;
const slug = values.name.trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z0-9]/g, "");

const steps = [
  sb.from("people").insert({ id, slug, full_name: values.name.trim(), email, phone: values.phone ?? null, share_class: "A", must_change_password: true }),
  sb.from("memberships").insert([
    { person_id: id, ledger_id: "company", role: "td_cofounder" },
    { person_id: id, ledger_id: "bidii", role: "td_cofounder" },
  ]),
  sb.from("permissions").insert(
    [
      ["company", "people_admin"],
      ["company", "approver"],
      ["company", "second_signer"],
      ["company", "settings_editor"],
      ["company", "task_assigner"],
      ["bidii", "task_assigner"],
      ["bidii", "approver"],
      ["bidii", "second_signer"],
      ["bidii", "statement_checker"],
      ["bidii", "task_reviewer"],
      ["bidii", "commission_assigner"],
      ["bidii", "settings_editor"],
    ].map(([ledger_id, permission]) => ({ person_id: id, ledger_id, permission, limit_kes: permission === "approver" ? 20000 : null })),
  ),
];
for (const step of steps) {
  const { error: e } = await step;
  if (e) {
    console.error(e.message);
    process.exit(1);
  }
}
await sb.from("share_register").insert({ holder_id: id, share_class: "A", parts: 75, issued: true, note: "Co-founder" });
console.log(`Created ${values.name} (${email}). Sign in with the temporary password, then choose your own.`);
