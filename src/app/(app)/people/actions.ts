"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { can, getViewer } from "@/lib/data/queries";
import type { Permission, Role } from "@/lib/data/types";
import { isDemo } from "@/lib/demo";
import { addPerson, resetPassword, setActive } from "@/lib/people";
import { supabaseServer } from "@/lib/supabase/server";

const PERMISSIONS: Permission[] = [
  "approver",
  "second_signer",
  "statement_preparer",
  "statement_checker",
  "month_closer",
  "ledger_editor",
  "settings_editor",
  "commission_assigner",
  "task_reviewer",
  "special_price_approver",
  "people_admin",
  "task_assigner",
];

async function requireAdmin() {
  const viewer = await getViewer();
  if (!can(viewer, "company", "people_admin")) redirect("/");
  return viewer;
}

export async function addPersonAction(formData: FormData) {
  const viewer = await requireAdmin();
  if (isDemo()) redirect("/people?done=demo");

  const role = String(formData.get("role")) as Role;
  const limit = Number(formData.get("approver_limit") || 0) || null;
  const permissions = PERMISSIONS.filter((p) => formData.get(`perm_${p}`) === "on").map((permission) => ({
    // Adding people is company-wide; money permissions are on Bidii.
    ledgerId: permission === "people_admin" ? "company" : "bidii",
    permission,
    limitKes: permission === "approver" ? limit : null,
  }));
  // Class A co-founders also hold their money permissions on the company ledger.
  if (role === "td_cofounder") {
    for (const p of permissions.filter((x) => x.ledgerId === "bidii" && ["approver", "second_signer", "ledger_editor", "settings_editor", "task_assigner"].includes(x.permission))) {
      permissions.push({ ...p, ledgerId: "company" });
    }
  }

  const result = await addPerson(viewer.id, {
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    role,
    shareClass: role === "td_cofounder" ? "A" : role === "product_cofounder" ? "B" : null,
    temporaryPassword: String(formData.get("temporary_password") ?? ""),
    permissions,
  });
  if (result.error) redirect(`/people?error=${encodeURIComponent(result.error)}`);
  revalidatePath("/people");
  redirect("/people?done=added");
}

/** Give or take away someone's roles. The database checks it is allowed. */
export async function setRolesAction(formData: FormData) {
  await requireAdmin();
  if (isDemo()) redirect("/people?done=demo");
  const id = String(formData.get("id"));
  const ledgers = String(formData.get("ledgers") ?? "").split(",").filter(Boolean);
  const limit = Number(formData.get("approver_limit") || 0) || null;
  const chosen = PERMISSIONS.filter((p) => formData.get(`perm_${p}`) === "on");
  // Each role applies in every company the person is in (adding people is company-wide).
  const permissions = chosen.flatMap((permission) =>
    (permission === "people_admin" ? ["company"] : ledgers).map((ledgerId) => ({ ledgerId, permission, limitKes: permission === "approver" ? limit : null })),
  );
  const sb = await supabaseServer();
  const { error } = await sb.rpc("set_permissions", { p_person: id, p_permissions: permissions });
  if (error) redirect(`/people?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/people");
  redirect("/people?done=roles");
}

export async function setActiveAction(formData: FormData) {
  const viewer = await requireAdmin();
  if (isDemo()) redirect("/people?done=demo");
  const result = await setActive(viewer.id, String(formData.get("id")), formData.get("active") === "true");
  if (result.error) redirect(`/people?error=${encodeURIComponent(result.error)}`);
  revalidatePath("/people");
  redirect("/people");
}

export async function resetPasswordAction(formData: FormData) {
  const viewer = await requireAdmin();
  if (isDemo()) redirect("/people?done=demo");
  const result = await resetPassword(viewer.id, String(formData.get("id")), String(formData.get("temporary_password") ?? ""));
  if (result.error) redirect(`/people?error=${encodeURIComponent(result.error)}`);
  redirect("/people?done=reset");
}
