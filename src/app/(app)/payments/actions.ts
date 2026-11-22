"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { can, getViewer } from "@/lib/data/queries";
import { isDemo } from "@/lib/demo";
import { supabaseServer } from "@/lib/supabase/server";
import { saveLabel } from "@/lib/mpesa/labels";

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

/**
 * Put an unmatched payment under one of your custom topics or a category.
 * A label only: nothing is credited to an invoice or the ledger. With
 * "remember", later payments with the same account number get the same label.
 */
export async function labelPayment(id: string, kind: "topic" | "category", targetId: string, label: string, remember: boolean): Promise<{ ok: boolean; message: string }> {
  const viewer = await getViewer();
  if (!can(viewer, "bidii", "ledger_editor")) return { ok: false, message: "Only people who can edit the ledger can do that." };
  if (!["topic", "category"].includes(kind) || !targetId.trim() || !label.trim()) return { ok: false, message: "Choose where this payment belongs." };
  try {
    let accountRef: string | null = null;
    if (isDemo()) {
      accountRef = (await import("@/lib/mpesa/demo")).DEMO_PAYMENTS.find((p) => p.id === id)?.accountRef ?? null;
    } else {
      const sb = await supabaseServer();
      const { data } = await sb.from("mpesa_transactions").select("status, account_ref").eq("id", id).maybeSingle();
      if (!data) return { ok: false, message: "That payment wasn't found." };
      if (data.status !== "unmatched" && data.status !== "review") return { ok: false, message: "Only payments nobody has matched can be labelled." };
      accountRef = data.account_ref;
    }
    await saveLabel({ id, accountRef }, { kind, id: targetId.slice(0, 80), label: label.slice(0, 80) }, viewer.id, remember);
    revalidatePath("/payments");
    return { ok: true, message: `Put under ${label}.` };
  } catch (e) {
    return { ok: false, message: `Couldn't save: ${(e as Error).message}` };
  }
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
