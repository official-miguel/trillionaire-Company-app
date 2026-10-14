// Gives people a temporary password, so they can sign in and choose their own.
//   npm run reset-passwords                 everyone
//   npm run reset-passwords -- a@x.co b@y.co  only these emails
// The passwords are written to temp-passwords.local.txt (git ignores it),
// never printed, so they don't end up in a terminal history or chat.
// Each person must choose a new password the first time they sign in.
import { createClient } from "@supabase/supabase-js";
import { randomInt } from "node:crypto";
import { writeFileSync } from "node:fs";

process.loadEnvFile?.(".env.local");
const only = process.argv.slice(2).map((e) => e.toLowerCase());
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Easy to read out on the phone; always has a capital letter and a number.
const WORDS = ["Mango", "Simba", "Twiga", "Nyota", "Bahari", "Jua", "Mvua", "Kahawa", "Chai", "Nuru"];
const temp = () => `${WORDS[randomInt(WORDS.length)]}-${WORDS[randomInt(WORDS.length)].toLowerCase()}-${randomInt(1000, 9999)}`;

const { data: people, error } = await sb.from("people").select("id, full_name, email").eq("active", true).order("full_name");
if (error) {
  console.error(error.message);
  process.exit(1);
}

const lines = ["Temporary passwords. Give each person theirs privately, then delete this file.", ""];
for (const p of people.filter((x) => !only.length || only.includes(x.email))) {
  const password = temp();
  const { error: e } = await sb.auth.admin.updateUserById(p.id, { password });
  if (e) {
    console.error(`${p.full_name}: ${e.message}`);
    continue;
  }
  await sb.from("people").update({ must_change_password: true }).eq("id", p.id);
  await sb.from("audit_log").insert({ action: "password_reset", subject_type: "person", subject_id: p.id, details: { by: "reset-passwords script" } });
  lines.push(`${p.full_name.padEnd(18)} ${p.email.padEnd(34)} ${password}`);
  console.log(`Reset ${p.full_name}`);
}
writeFileSync("temp-passwords.local.txt", lines.join("\n") + "\n");
console.log("Saved to temp-passwords.local.txt");
