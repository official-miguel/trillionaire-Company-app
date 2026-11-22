import "server-only";
import { isDemo } from "@/lib/demo";
import { supabaseServer } from "@/lib/supabase/server";
import { cleanSearch } from "./helpers";
import * as demo from "./demo";
import type { FailedCallback, MpesaConfig, Payment, PaymentDetail, PaymentFilters, PaymentSummary } from "./types";

// Reads run as the signed-in person, so row level security decides what they see.

/** The settings, without any key. Null for anyone who may not change Settings. */
export async function getMpesaConfig(): Promise<MpesaConfig | null> {
  if (isDemo()) return demo.DEMO_CONFIG;
  const sb = await supabaseServer();
  const { data } = await sb.from("mpesa_config").select("*").maybeSingle();
  if (!data) return null;
  return {
    enabled: data.enabled,
    environment: data.environment,
    shortcode: data.shortcode,
    shortcodeType: data.shortcode_type,
    hasConsumerKey: !!data.consumer_key_id,
    hasConsumerSecret: !!data.consumer_secret_id,
    hasPasskey: !!data.passkey_id,
    hasCallbackToken: !!data.callback_token_id,
    status: data.status,
    statusDetail: data.status_detail,
    testedAt: data.tested_at,
    urlsRegisteredAt: data.urls_registered_at,
    lastSyncAt: data.last_sync_at,
    updatedAt: data.updated_at,
  };
}

const PAYMENT_COLUMNS = "*, schools:school_id(name), invoices:invoice_id(number)";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toPayment(t: any): Payment {
  return {
    id: t.id,
    receipt: t.receipt,
    paidAt: t.paid_at,
    amount: Number(t.amount),
    phone: t.phone,
    payerName: t.payer_name,
    accountRef: t.account_ref,
    status: t.status,
    matchMethod: t.match_method,
    schoolId: t.school_id,
    schoolName: t.schools?.name ?? null,
    invoiceId: t.invoice_id,
    invoiceNumber: t.invoices?.number ?? null,
    note: t.note,
  };
}

/** Dates are Nairobi days: from the start of `from` to the end of `to`. */
const dayStart = (d: string) => `${d}T00:00:00+03:00`;
const nextDay = (d: string) => {
  const t = new Date(`${d}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 1);
  return `${t.toISOString().slice(0, 10)}T00:00:00+03:00`;
};
const isDay = (d?: string) => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d);

export async function getPayments(filters: PaymentFilters, limit = 100): Promise<Payment[]> {
  if (isDemo()) return demo.filterDemo(filters).slice(0, limit);
  // Failed callbacks never became payments: see getOpenCallbacks.
  if (filters.status === "failed") return [];
  const sb = await supabaseServer();
  let query = sb.from("mpesa_transactions").select(PAYMENT_COLUMNS).order("paid_at", { ascending: false }).limit(limit);
  if (isDay(filters.from)) query = query.gte("paid_at", dayStart(filters.from!));
  if (isDay(filters.to)) query = query.lt("paid_at", nextDay(filters.to!));
  if (filters.status === "pending") query = query.eq("status", "received");
  else if (filters.status) query = query.eq("status", filters.status);
  const q = cleanSearch(filters.q);
  if (q) query = query.or(["receipt", "phone", "payer_name", "account_ref"].map((c) => `${c}.ilike.%${q}%`).join(","));
  const { data } = await query;
  return (data ?? []).map(toPayment);
}

export async function getPaymentSummary(filters: Pick<PaymentFilters, "from" | "to">): Promise<PaymentSummary> {
  const sum: PaymentSummary = { count: 0, matched: 0, unmatched: 0, review: 0, pending: 0, failed: 0, reversed: 0, total: 0, matchedTotal: 0 };
  let rows: { status: string; amount: number }[];
  let callbacks: { status: string }[];
  if (isDemo()) {
    rows = demo.filterDemo(filters);
    callbacks = demo.DEMO_CALLBACKS;
  } else {
    const sb = await supabaseServer();
    let tx = sb.from("mpesa_transactions").select("status, amount").limit(10000);
    let cb = sb.from("mpesa_callbacks").select("status").in("status", ["pending", "failed"]).limit(1000);
    if (isDay(filters.from)) {
      tx = tx.gte("paid_at", dayStart(filters.from!));
      cb = cb.gte("received_at", dayStart(filters.from!));
    }
    if (isDay(filters.to)) {
      tx = tx.lt("paid_at", nextDay(filters.to!));
      cb = cb.lt("received_at", nextDay(filters.to!));
    }
    const [{ data: t }, { data: c }] = await Promise.all([tx, cb]);
    rows = t ?? [];
    callbacks = c ?? [];
  }
  for (const r of rows) {
    const amount = Number(r.amount);
    sum.count++;
    if (r.status !== "reversed") sum.total += amount;
    if (r.status === "matched") {
      sum.matched++;
      sum.matchedTotal += amount;
    }
    if (r.status === "unmatched") sum.unmatched++;
    if (r.status === "review") sum.review++;
    if (r.status === "received") sum.pending++;
    if (r.status === "reversed") sum.reversed++;
  }
  for (const c of callbacks) {
    if (c.status === "failed") sum.failed++;
    else sum.pending++;
  }
  return sum;
}

/** Callbacks that failed or are still waiting to be processed. */
export async function getOpenCallbacks(): Promise<FailedCallback[]> {
  if (isDemo()) return demo.DEMO_CALLBACKS;
  const sb = await supabaseServer();
  const { data } = await sb
    .from("mpesa_callbacks")
    .select("id, received_at, status, attempts, error, payload")
    .in("status", ["pending", "failed"])
    .order("received_at", { ascending: false })
    .limit(50);
  return (data ?? []).map((c) => ({
    id: c.id,
    receivedAt: c.received_at,
    status: c.status,
    attempts: c.attempts,
    error: c.error,
    receipt: typeof c.payload?.TransID === "string" ? c.payload.TransID : null,
    amount: c.payload?.TransAmount != null ? String(c.payload.TransAmount) : null,
  }));
}

const ACTIONS: Record<string, string> = {
  mpesa_received: "Received from Safaricom",
  mpesa_duplicate_ignored: "Sent again by Safaricom; not credited twice",
  mpesa_reconciled: "Reconciled by hand",
  mpesa_reversed: "Reversed",
};

export async function getPayment(id: string): Promise<PaymentDetail | null> {
  if (isDemo()) return demo.demoDetail(id);
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const sb = await supabaseServer();
  const [{ data: t }, { data: trail }] = await Promise.all([
    sb.from("mpesa_transactions").select(`${PAYMENT_COLUMNS}, reconciler:reconciled_by(full_name)`).eq("id", id).maybeSingle(),
    sb
      .from("audit_log")
      .select("action, created_at, details, people:actor_id(full_name)")
      .eq("subject_type", "mpesa_transaction")
      .eq("subject_id", id)
      .order("id"),
  ]);
  if (!t) return null;
  return {
    ...toPayment(t),
    transactionType: t.transaction_type,
    shortcode: t.shortcode,
    orgBalance: t.org_balance == null ? null : Number(t.org_balance),
    ledgerLineId: t.ledger_line_id,
    reversalLineId: t.reversal_line_id,
    reconciledBy: t.reconciler?.full_name ?? null,
    reconciledAt: t.reconciled_at,
    createdAt: t.created_at,
    trail: (trail ?? []).map((a) => ({
      action: ACTIONS[a.action] ?? a.action,
      who: (a.people as unknown as { full_name: string } | null)?.full_name ?? null,
      at: a.created_at,
      details: a.details ?? {},
    })),
  };
}

/** Invoices still owed, to choose from when matching by hand. */
export async function getOpenInvoices(): Promise<{ id: string; number: string; schoolName: string; owed: number }[]> {
  if (isDemo()) return demo.DEMO_OPEN_INVOICES;
  const sb = await supabaseServer();
  const { data } = await sb
    .from("invoices")
    .select("id, number, amount, schools(name), ledger_lines(amount)")
    .in("status", ["open", "part_paid"])
    .order("due_on")
    .limit(300);
  return (data ?? []).map((i) => ({
    id: i.id,
    number: i.number,
    schoolName: (i.schools as unknown as { name: string } | null)?.name ?? "",
    owed: Number(i.amount) - (i.ledger_lines ?? []).reduce((s: number, l: { amount: number }) => s + Number(l.amount), 0),
  }));
}
