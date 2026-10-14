"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isDemo } from "@/lib/demo";
import { supabaseServer } from "@/lib/supabase/server";
import { getApprovers, getRequests, getViewer } from "@/lib/data/queries";
import { approvalNeed } from "@/lib/money/approvals";

export async function askForMoney(formData: FormData) {
  const amount = Number(formData.get("amount"));
  const purpose = String(formData.get("purpose") ?? "").trim();
  const potId = String(formData.get("pot") ?? "");
  if (!(amount > 0) || !purpose || !potId) redirect("/requests?error=missing");
  if (isDemo()) redirect("/requests?sent=demo");

  const viewer = await getViewer();
  const sb = await supabaseServer();
  const { error } = await sb.from("requests").insert({
    ledger_id: potId.split(".")[0],
    pot_id: potId,
    requester_id: viewer.id,
    amount,
    purpose,
    personal: formData.get("personal") === "on",
  });
  if (error) redirect("/requests?error=save");
  revalidatePath("/requests");
  redirect("/requests?sent=1");
}

export async function decide(formData: FormData) {
  const id = String(formData.get("id"));
  const decision = formData.get("decision") === "reject" ? "reject" : "approve";
  if (isDemo()) redirect(`/requests?decided=demo`);

  const [viewer, requests, approvers] = await Promise.all([getViewer(), getRequests(), getApprovers()]);
  const req = requests.find((r) => r.id === id);
  if (!req || req.status !== "waiting") redirect("/requests");
  const need = approvalNeed(
    { requesterSlug: req.requesterSlug, amount: req.amount, potKey: req.potId.split(".")[1], approvedBy: [] },
    approvers,
  );
  if (!need.eligible.some((a) => a.slug === viewer.slug)) redirect("/requests?error=not-yours");

  const sb = await supabaseServer();
  await sb.from("approvals").insert({ subject_type: "request", subject_id: id, person_id: viewer.id, decision });

  const approvedBy = [...req.approvals.filter((a) => a.decision === "approve").map((a) => a.name), ...(decision === "approve" ? [viewer.name] : [])];
  const slugsApproved = approvers.filter((a) => approvedBy.includes(a.name)).map((a) => a.slug);
  const after = approvalNeed({ ...{ requesterSlug: req.requesterSlug, amount: req.amount, potKey: req.potId.split(".")[1] }, approvedBy: slugsApproved }, approvers);
  // Status changes go through the database function so RLS can stay strict.
  if (decision === "reject") await sb.rpc("set_request_status", { request_id: id, new_status: "rejected" });
  else if (after.done) await sb.rpc("set_request_status", { request_id: id, new_status: "approved" });

  revalidatePath("/requests");
  revalidatePath("/");
  redirect("/requests");
}
