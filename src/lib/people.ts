// Adding and switching off people, the same way the Bidii super admin does:
// an admin types a temporary password, the person must choose their own on
// first sign-in, and nobody is ever deleted.
import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { checkBidiiPassword } from "@/lib/bidii";
import type { Permission, Role } from "@/lib/data/types";

export interface NewPerson {
  name: string;
  email: string;
  phone: string;
  role: Role;
  shareClass: "A" | "B" | null;
  temporaryPassword: string;
  permissions: { ledgerId: string; permission: Permission; limitKes?: number | null }[];
}

export interface PersonRow {
  id: string;
  slug: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role | null;
  shareClass: "A" | "B" | null;
  active: boolean;
  mustChangePassword: boolean;
  permissions: { ledgerId: string; permission: Permission; limitKes: number | null }[];
}

/** Ledgers each role sees. Class A co-founders see every ledger. */
export function ledgersForRole(role: Role, allLedgers: string[]): string[] {
  if (role === "td_cofounder" || role === "accountant") return allLedgers;
  return ["bidii"];
}

const ROLES: Role[] = ["td_cofounder", "product_cofounder", "product_team", "accountant"];

export function validateNewPerson(p: NewPerson): string | null {
  if (!p.name.trim()) return "Enter a name.";
  if (!ROLES.includes(p.role)) return "Choose who they are.";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p.email)) return "Enter a valid email address.";
  if (p.temporaryPassword.length < 8) return "The temporary password must be at least 8 characters.";
  if (p.role === "td_cofounder" && p.shareClass !== "A") return "A Trillionaire Designs co-founder holds Class A shares.";
  if (p.role === "product_cofounder" && p.shareClass !== "B") return "A Bidii co-founder holds Class B shares.";
  if (p.role === "accountant" && p.permissions.length) return "An accountant only reads; give them no permissions.";
  return null;
}

/** Kenyan numbers in +254 form; anything else kept as typed (as Bidii does). */
export function toE164Kenya(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, "");
  if (/^0[17]\d{8}$/.test(digits)) return `+254${digits.slice(1)}`;
  if (/^254[17]\d{8}$/.test(digits)) return `+${digits}`;
  if (/^[17]\d{8}$/.test(digits)) return `+254${digits}`;
  return raw.trim();
}

export function slugFor(name: string, taken: string[]): string {
  const base = name.trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z0-9]/g, "") || "person";
  let slug = base;
  for (let i = 2; taken.includes(slug); i++) slug = `${base}${i}`;
  return slug;
}

export async function listPeople(): Promise<PersonRow[]> {
  const sb = supabaseAdmin();
  const [{ data: people }, { data: memberships }, { data: perms }] = await Promise.all([
    sb.from("people").select("*").order("created_at"),
    sb.from("memberships").select("person_id, role"),
    sb.from("permissions").select("person_id, ledger_id, permission, limit_kes"),
  ]);
  return (people ?? []).map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.full_name,
    email: p.email,
    phone: p.phone,
    role: (memberships ?? []).find((m) => m.person_id === p.id)?.role ?? null,
    shareClass: p.share_class,
    active: p.active,
    mustChangePassword: p.must_change_password,
    permissions: (perms ?? [])
      .filter((x) => x.person_id === p.id)
      .map((x) => ({ ledgerId: x.ledger_id, permission: x.permission, limitKes: x.limit_kes === null ? null : Number(x.limit_kes) })),
  }));
}

export async function addPerson(actorId: string, p: NewPerson): Promise<{ error?: string }> {
  const problem = validateNewPerson(p);
  if (problem) return { error: problem };

  const sb = supabaseAdmin();
  const email = p.email.trim().toLowerCase();
  const { data: existing } = await sb.from("people").select("slug, email");
  if ((existing ?? []).some((x) => x.email === email)) return { error: "Someone with that email is already in the app." };

  const { data: created, error: authError } = await sb.auth.admin.createUser({
    email,
    password: p.temporaryPassword,
    email_confirm: true,
    user_metadata: { full_name: p.name.trim() },
  });
  if (authError || !created.user) return { error: authError?.message ?? "The sign-in account couldn't be created." };

  const id = created.user.id;
  const { data: ledgers } = await sb.from("ledgers").select("id");
  const slug = slugFor(p.name, (existing ?? []).map((x) => x.slug));

  const { error: personError } = await sb.from("people").insert({
    id,
    slug,
    full_name: p.name.trim(),
    email,
    phone: p.phone ? toE164Kenya(p.phone) : null,
    share_class: p.shareClass,
    must_change_password: true,
  });
  if (personError) {
    // Undo the half-made sign-in account so the admin can try again cleanly.
    await sb.auth.admin.deleteUser(id);
    return { error: "The person couldn't be saved. Try again." };
  }

  const visible = ledgersForRole(p.role, (ledgers ?? []).map((l) => l.id));
  const allowed = p.permissions.filter((x) => visible.includes(x.ledgerId));
  const { error: memberError } = await sb.from("memberships").insert(visible.map((ledger_id) => ({ person_id: id, ledger_id, role: p.role })));
  const { error: permError } = memberError || !allowed.length
    ? { error: null }
    : await sb.from("permissions").insert(allowed.map((x) => ({ person_id: id, ledger_id: x.ledgerId, permission: x.permission, limit_kes: x.limitKes ?? null })));
  if (memberError || permError) {
    // Never leave someone who can sign in but has no role: undo it all.
    await sb.from("permissions").delete().eq("person_id", id);
    await sb.from("memberships").delete().eq("person_id", id);
    await sb.from("people").delete().eq("id", id);
    await sb.auth.admin.deleteUser(id);
    return { error: "The person couldn't be saved. Nothing was changed; try again." };
  }

  await sb.from("audit_log").insert({
    actor_id: actorId,
    action: "person_added",
    subject_type: "person",
    subject_id: id,
    details: { name: p.name, email, role: p.role, permissions: allowed },
  });
  return {};
}

/**
 * First sign-in with a Bidii password: for someone who has never chosen a
 * password here, if Bidii confirms the password they typed, it becomes their
 * password here too. After that this app keeps it, and Bidii follows.
 */
export async function adoptBidiiPassword(email: string, password: string): Promise<boolean> {
  const sb = supabaseAdmin();
  const { data: person } = await sb.from("people").select("id, active, must_change_password").eq("email", email.trim().toLowerCase()).maybeSingle();
  if (!person || !person.active || !person.must_change_password) return false;
  if (!(await checkBidiiPassword(email, password))) return false;

  const { error } = await sb.auth.admin.updateUserById(person.id, { password });
  if (error) return false;
  await sb.from("people").update({ must_change_password: false }).eq("id", person.id);
  await sb.from("audit_log").insert({ actor_id: person.id, action: "password_from_bidii", subject_type: "person", subject_id: person.id });
  return true;
}

/** Switching someone off blocks sign-in at once; their records stay. */
export async function setActive(actorId: string, personId: string, active: boolean): Promise<{ error?: string }> {
  if (actorId === personId && !active) return { error: "You can't switch off your own account." };
  const sb = supabaseAdmin();
  const { error } = await sb.auth.admin.updateUserById(personId, { ban_duration: active ? "none" : "876000h" });
  if (error) return { error: error.message };
  await sb.from("people").update({ active }).eq("id", personId);
  await sb.from("audit_log").insert({
    actor_id: actorId,
    action: active ? "person_switched_on" : "person_switched_off",
    subject_type: "person",
    subject_id: personId,
  });
  return {};
}

/** A new temporary password, which the person must change on next sign-in. */
export async function resetPassword(actorId: string, personId: string, temporaryPassword: string): Promise<{ error?: string }> {
  if (temporaryPassword.length < 8) return { error: "The temporary password must be at least 8 characters." };
  const sb = supabaseAdmin();
  const { error } = await sb.auth.admin.updateUserById(personId, { password: temporaryPassword });
  if (error) return { error: error.message };
  await sb.from("people").update({ must_change_password: true }).eq("id", personId);
  await sb.from("audit_log").insert({ actor_id: actorId, action: "password_reset", subject_type: "person", subject_id: personId });
  return {};
}
