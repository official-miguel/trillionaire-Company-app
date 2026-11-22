import "server-only";
import { isDemo } from "@/lib/demo";
import { supabaseServer } from "@/lib/supabase/server";

// What the bell shows: the notices that are also pushed to devices
// (reminder_jobs): setting changes, tasks given to you and M-PESA payments.

export interface AppNotification {
  id: string;
  kind: "notice" | "payment" | "task_given";
  title: string;
  body: string;
  url: string;
  at: string;
  read: boolean;
  payment?: { receipt: string; amount: number; payer: string; phone: string | null; paidAt: string; status: string };
}

export const BELL_KINDS = ["notice", "payment", "task_given"];

export async function getNotifications(limit = 30): Promise<{ items: AppNotification[]; unread: number }> {
  if (isDemo()) return demoNotifications();
  const sb = await supabaseServer();
  const now = new Date().toISOString();
  const [{ data }, { count }] = await Promise.all([
    sb.from("reminder_jobs").select("id, kind, title, body, url, fire_at, read_at, data").in("kind", BELL_KINDS).lte("fire_at", now).order("fire_at", { ascending: false }).limit(limit),
    sb.from("reminder_jobs").select("id", { count: "exact", head: true }).in("kind", BELL_KINDS).lte("fire_at", now).is("read_at", null),
  ]);
  const rows = data ?? [];

  // A payment's status may have moved on since it was notified: show today's.
  const txIds = [...new Set(rows.map((r) => r.data?.transactionId).filter((v): v is string => typeof v === "string"))];
  const { data: live } = txIds.length ? await sb.from("mpesa_transactions").select("id, status").in("id", txIds) : { data: [] };
  const statusOf = new Map((live ?? []).map((t) => [t.id, t.status as string]));

  return {
    unread: count ?? 0,
    items: rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      title: r.title,
      body: r.body,
      url: r.url,
      at: r.fire_at,
      read: !!r.read_at,
      payment:
        r.kind === "payment" && r.data?.receipt
          ? {
              receipt: r.data.receipt,
              amount: Number(r.data.amount),
              payer: r.data.payer,
              phone: r.data.phone ?? null,
              paidAt: r.data.paidAt,
              status: statusOf.get(r.data.transactionId) ?? r.data.status,
            }
          : undefined,
    })),
  };
}

export async function markNotificationsRead(ids: string[] | null) {
  if (isDemo()) return;
  const sb = await supabaseServer();
  const { error } = await sb.rpc("mark_notifications_read", { p_ids: ids });
  if (error) throw new Error(error.message);
}

function demoNotifications(): { items: AppNotification[]; unread: number } {
  const items: AppNotification[] = [
    {
      id: "demo-n1", kind: "payment", title: "M-PESA payment received and reconciled",
      body: "KES 20,000 from Thika Road Primary · SKA1B2C3D4", url: "/payments/demo-pay-1", at: "2026-11-06T11:05:02Z", read: false,
      payment: { receipt: "SKA1B2C3D4", amount: 20000, payer: "Thika Road Primary", phone: "2547****149", paidAt: "2026-11-06T11:05:01Z", status: "matched" },
    },
    {
      id: "demo-n2", kind: "payment", title: "M-PESA payment received, not matched",
      body: "KES 700 from Peter Otieno · SKA9F8E7D6", url: "/payments/demo-pay-2", at: "2026-11-05T07:41:01Z", read: false,
      payment: { receipt: "SKA9F8E7D6", amount: 700, payer: "Peter Otieno", phone: "2547****149", paidAt: "2026-11-05T07:41:00Z", status: "unmatched" },
    },
    {
      id: "demo-n3", kind: "notice", title: "Miguel changed the team pool weights",
      body: "Samuel leads field sales", url: "/settings", at: "2026-11-03T09:00:00Z", read: true,
    },
  ];
  return { items, unread: items.filter((i) => !i.read).length };
}
