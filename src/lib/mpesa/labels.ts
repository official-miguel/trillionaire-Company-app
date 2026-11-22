import "server-only";
import { isDemo } from "@/lib/demo";
import { supabaseServer } from "@/lib/supabase/server";
import type { Payment, PaymentLabel, PaymentSuggestion } from "./types";

// Labels for payments nobody could match to a school: a custom topic or a
// category, chosen by hand. A label never credits an invoice or touches a
// ledger line (that is what "Reconcile by hand" is for). Demo mode keeps them
// in server memory until the dev server restarts.

export interface LabelTarget {
  kind: "topic" | "category";
  id: string;
  label: string;
}

const mem = globalThis as unknown as { __payLabels?: Record<string, LabelTarget>; __payRules?: Record<string, LabelTarget> };
const demoLabels = () => (mem.__payLabels ??= {});
const demoRules = () => (mem.__payRules ??= {});

export const refKey = (ref: string | null | undefined) => (ref ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

type Row = { target_kind: "topic" | "category"; target_id: string; target_label: string };
const toTarget = (r: Row): LabelTarget => ({ kind: r.target_kind, id: r.target_id, label: r.target_label });

/**
 * Adds, to each payment that nobody matched: the label you gave it (or one
 * remembered from an earlier payment with the same account number), and a
 * "same as before" school suggestion from an earlier hand match.
 */
export async function withLabels(payments: Payment[]): Promise<Payment[]> {
  const open = payments.filter((p) => p.status === "unmatched" || p.status === "review");
  if (open.length === 0) return payments;

  let labels: Record<string, LabelTarget> = {};
  let rules: Record<string, LabelTarget> = {};
  const schoolBefore: Record<string, PaymentSuggestion> = {};

  if (isDemo()) {
    labels = demoLabels();
    rules = demoRules();
    for (const p of payments) if (p.matchMethod === "manual" && p.schoolId && refKey(p.accountRef)) schoolBefore[refKey(p.accountRef)] = { schoolId: p.schoolId, schoolName: p.schoolName ?? "" };
  } else {
    const sb = await supabaseServer();
    const refs = [...new Set(open.map((p) => p.accountRef).filter((r): r is string => !!refKey(r)))];
    const [a, r, m] = await Promise.all([
      sb.from("mpesa_payment_labels").select("transaction_id, target_kind, target_id, target_label").in("transaction_id", open.map((p) => p.id)),
      refs.length ? sb.from("mpesa_label_rules").select("account_ref, target_kind, target_id, target_label").in("account_ref", refs.map(refKey)) : Promise.resolve({ data: [], error: null }),
      refs.length
        ? sb.from("mpesa_transactions").select("account_ref, school_id, schools:school_id(name)").eq("match_method", "manual").not("school_id", "is", null).in("account_ref", refs).order("reconciled_at", { ascending: false }).limit(200)
        : Promise.resolve({ data: [], error: null }),
    ]);
    // Before the labels migration runs these tables are missing: show everything as unidentified instead of failing.
    if (a.error || r.error) console.error("[payments] labels unavailable", (a.error ?? r.error)?.message);
    labels = Object.fromEntries((a.data ?? []).map((x) => [x.transaction_id as string, toTarget(x)]));
    rules = Object.fromEntries((r.data ?? []).map((x) => [x.account_ref as string, toTarget(x)]));
    for (const x of m.data ?? []) {
      const k = refKey(x.account_ref);
      if (k && !schoolBefore[k]) schoolBefore[k] = { schoolId: x.school_id as string, schoolName: (x.schools as unknown as { name: string } | null)?.name ?? "" };
    }
  }

  return payments.map((p) => {
    if (p.status !== "unmatched" && p.status !== "review") return p;
    const key = refKey(p.accountRef);
    const own = labels[p.id];
    const remembered = key ? rules[key] : undefined;
    const label: PaymentLabel | null = own ? { ...own, via: "assigned" } : remembered ? { ...remembered, via: "remembered" } : null;
    return { ...p, label, suggestion: !label && key ? (schoolBefore[key] ?? null) : null };
  });
}

export async function saveLabel(tx: { id: string; accountRef: string | null }, target: LabelTarget, actor: string, remember: boolean) {
  const key = refKey(tx.accountRef);
  if (isDemo()) {
    demoLabels()[tx.id] = target;
    if (remember && key) demoRules()[key] = target;
    return;
  }
  const sb = await supabaseServer();
  const row = { target_kind: target.kind, target_id: target.id, target_label: target.label };
  const a = await sb.from("mpesa_payment_labels").upsert({ transaction_id: tx.id, ...row, assigned_by: actor, assigned_at: new Date().toISOString() });
  if (a.error) throw new Error(a.error.message);
  if (remember && key) {
    const r = await sb.from("mpesa_label_rules").upsert({ account_ref: key, ...row, updated_at: new Date().toISOString() });
    if (r.error) throw new Error(r.error.message);
  }
}
