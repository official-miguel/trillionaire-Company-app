"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { can, getViewer } from "@/lib/data/queries";
import { isDemo } from "@/lib/demo";
import { supabaseServer } from "@/lib/supabase/server";

// Every change is checked again in the database (mpesa_reconcile,
// mpesa_reverse, mpesa_retry_callback), which also keeps the audit trail.

async function requireEditor(back: string) {
  const viewer = await getViewer();
  if (!can(viewer, "bidii", "ledger_editor")) redirect(`${back}?error=not-allowed`);
}

/** Match an unmatched payment by hand: to an invoice, a school, or other money in. */
export async function reconcilePayment(formData: FormData) {
  const id = String(formData.get("id"));
  const back = `/payments/${id}`;
  await requireEditor(back);
  if (isDemo()) redirect(`${back}?done=demo`);

  const [kind, target] = String(formData.get("target") ?? "").split(":");
  const sb = await supabaseServer();
  const { error } = await sb.rpc("mpesa_reconcile", {
    p_tx: id,
    p_invoice: kind === "invoice" ? target : null,
    p_school: kind === "school" ? target : null,
    p_note: String(formData.get("note") ?? ""),
  });
  if (error) redirect(`${back}?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/payments");
  revalidatePath("/schools");
  revalidatePath("/money");
  redirect(`${back}?done=reconciled`);
}

/** Record that a payment was reversed on M-PESA. */
export async function reversePayment(formData: FormData) {
  const id = String(formData.get("id"));
  const back = `/payments/${id}`;
  await requireEditor(back);
  if (isDemo()) redirect(`${back}?done=demo`);
  const sb = await supabaseServer();
  const { error } = await sb.rpc("mpesa_reverse", { p_tx: id, p_reason: String(formData.get("reason") ?? "") });
  if (error) redirect(`${back}?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/payments");
  revalidatePath("/schools");
  revalidatePath("/money");
  redirect(`${back}?done=reversed`);
}

/** Try a failed callback again now. */
export async function retryCallback(formData: FormData) {
  await requireEditor("/payments");
  if (isDemo()) redirect("/payments?status=failed&done=demo");
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("mpesa_retry_callback", { p_id: Number(formData.get("id")) });
  if (error) redirect(`/payments?status=failed&error=${encodeURIComponent(error.message)}`);
  revalidatePath("/payments");
  redirect(`/payments?status=failed&done=${data ? "retried" : "still-failing"}`);
}
