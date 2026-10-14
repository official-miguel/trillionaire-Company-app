import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isDemo } from "@/lib/demo";
import { supabaseServer } from "@/lib/supabase/server";
import { DEFAULT_MONEY, type MoneySettings } from "@/lib/money/monthEnd";
import { DEFAULT_PRICING, type PricingSettings } from "@/lib/money/pricing";
import type { Approver } from "@/lib/money/approvals";
import { monthBounds, monthLabel, todayIso } from "@/lib/format";
import * as demo from "./demo-data";
import { hasBidiiAccount } from "@/lib/bidii";
import type {
  ComingUpItem,
  Invoice,
  LedgerLine,
  MonthToDate,
  Permission,
  Pot,
  School,
  SettingRow,
  SpendRequest,
  Statement,
  Viewer,
} from "./types";

export const DEMO_COOKIE = "demo_as";

/** The signed-in person, with what their role lets them see. */
export const getViewer = cache(async (): Promise<Viewer> => {
  if (isDemo()) {
    const as = (await cookies()).get(DEMO_COOKIE)?.value ?? "miguel";
    return demo.DEMO_VIEWERS[as] ?? demo.DEMO_VIEWERS.miguel;
  }
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: person }, { data: memberships }, { data: perms }] = await Promise.all([
    sb.from("people").select("*").eq("id", user.id).single(),
    sb.from("memberships").select("ledger_id, role").eq("person_id", user.id),
    sb.from("permissions").select("ledger_id, permission, limit_kes").eq("person_id", user.id),
  ]);
  if (!person) redirect("/login?error=no-profile");
  if (!person.active) {
    await sb.auth.signOut();
    redirect("/login?error=switched-off");
  }

  const isClassA = (memberships ?? []).some((m) => m.role === "td_cofounder");
  const { data: ledgers } = await sb.from("ledgers").select("id"); // RLS returns only visible ledgers
  const permissions: Record<string, Permission[]> = {};
  for (const p of perms ?? []) (permissions[p.ledger_id] ??= []).push(p.permission);
  const limits = (perms ?? []).filter((p) => p.permission === "approver" && p.limit_kes != null).map((p) => Number(p.limit_kes));

  return {
    id: user.id,
    slug: person.slug,
    name: person.full_name,
    email: person.email,
    role: isClassA ? "td_cofounder" : (memberships?.[0]?.role ?? "product_team"),
    shareClass: person.share_class,
    ledgers: (ledgers ?? []).map((l) => l.id),
    permissions,
    approverLimit: limits.length ? Math.max(...limits) : null,
    // Bidii decides who is a super admin; the button shows only if it says so.
    bidiiSuperAdmin: await hasBidiiAccount(person.email),
    mustChangePassword: person.must_change_password,
  };
});

export function can(viewer: Viewer, ledgerId: string, permission: Permission) {
  return viewer.ledgers.includes(ledgerId) && (viewer.permissions[ledgerId] ?? []).includes(permission);
}

export const getSettings = cache(async (): Promise<{ money: MoneySettings; pricing: PricingSettings; rows: SettingRow[]; commission: { team: number; outside: number } }> => {
  if (isDemo()) {
    return { money: DEFAULT_MONEY, pricing: DEFAULT_PRICING, rows: demoSettingRows(), commission: { team: 0.03, outside: 0.05 } };
  }
  const sb = await supabaseServer();
  const { data } = await sb.from("settings").select("*").eq("status", "active");
  const rows: SettingRow[] = (data ?? []).map((r) => ({
    key: r.key,
    ledgerId: r.ledger_id,
    value: r.value,
    approvalRule: r.approval_rule,
    effectiveFrom: r.effective_from,
    reason: r.reason,
  }));
  const v = (key: string) => rows.find((r) => r.ledgerId === "bidii" && r.key === key)?.value as never;
  const shares = v("shares") as { classAShareOfBidii: number; classAParts: Record<string, number>; classBParts: Record<string, number> } | undefined;
  return {
    rows,
    money: {
      split: v("split") ?? DEFAULT_MONEY.split,
      weights: v("weights") ?? DEFAULT_MONEY.weights,
      classAShareOfBidii: shares?.classAShareOfBidii ?? DEFAULT_MONEY.classAShareOfBidii,
      classAParts: shares?.classAParts ?? DEFAULT_MONEY.classAParts,
      classBParts: shares?.classBParts ?? DEFAULT_MONEY.classBParts,
      missCuts: v("missCuts") ?? DEFAULT_MONEY.missCuts,
      reserveTargetMonths: (v("reserve") as { targetMonths: number } | undefined)?.targetMonths ?? DEFAULT_MONEY.reserveTargetMonths,
    },
    pricing: { ...DEFAULT_PRICING, ...((v("pricing") as Partial<PricingSettings> | undefined) ?? {}) },
    commission: v("commission") ?? { team: 0.03, outside: 0.05 },
  };
});

export async function getPots(): Promise<Pot[]> {
  if (isDemo()) return filterByViewer(demo.DEMO_POTS, await getViewer());
  const sb = await supabaseServer();
  const [{ data: pots }, { data: lines }] = await Promise.all([
    sb.from("pots").select("*"),
    sb.from("ledger_lines").select("pot_id, amount").neq("status", "draft"),
  ]);
  const balance = new Map<string, number>();
  for (const l of lines ?? []) if (l.pot_id) balance.set(l.pot_id, (balance.get(l.pot_id) ?? 0) + Number(l.amount));
  return (pots ?? [])
    .filter((p) => p.key !== "bills" && p.key !== "pool" && p.key !== "payout")
    .map((p) => ({ id: p.id, ledgerId: p.ledger_id, key: p.key, name: p.name, classAOnly: p.class_a_only, balance: balance.get(p.id) ?? 0 }));
}

export async function getLedgerLines(ledgerId: string): Promise<LedgerLine[]> {
  if (isDemo()) {
    const v = await getViewer();
    return v.ledgers.includes(ledgerId) ? demo.DEMO_LINES.filter((l) => l.ledgerId === ledgerId) : [];
  }
  const sb = await supabaseServer();
  const { data } = await sb
    .from("ledger_lines")
    .select("*, people:person_id(full_name), schools:school_id(name), referrers:referrer_id(full_name), ledger_line_history(count)")
    .eq("ledger_id", ledgerId)
    .order("occurred_on", { ascending: false })
    .limit(200);
  return (data ?? []).map((l) => ({
    id: l.id,
    ledgerId: l.ledger_id,
    occurredOn: l.occurred_on,
    type: l.type,
    potId: l.pot_id,
    amount: Number(l.amount),
    who: l.people?.full_name ?? l.schools?.name ?? l.referrers?.full_name ?? null,
    description: l.description,
    status: l.status,
    hasReceipt: !!l.receipt_path,
    edits: l.ledger_line_history?.[0]?.count ?? 0,
  }));
}

/** Money counted, bills and commission so far in the open period. */
export async function getMonthToDate(): Promise<MonthToDate> {
  if (isDemo()) return demo.DEMO_MONTH;
  const sb = await supabaseServer();
  const { data: period } = await sb
    .from("periods")
    .select("*")
    .eq("ledger_id", "bidii")
    .eq("status", "open")
    .order("starts_on", { ascending: false })
    .limit(1)
    .maybeSingle();
  // Months follow Nairobi dates, whatever time zone the server runs in.
  const month = monthBounds(todayIso());
  const startsOn = period?.starts_on ?? month.start;
  const endsOn = period?.ends_on ?? month.end;
  const { data: lines } = await sb
    .from("ledger_lines")
    .select("type, amount, pot_id")
    .eq("ledger_id", "bidii")
    .gte("occurred_on", startsOn)
    .lte("occurred_on", endsOn);
  let income = 0,
    bills = 0,
    commissions = 0;
  for (const l of lines ?? []) {
    const a = Number(l.amount);
    if (l.type === "money_in" && l.pot_id !== "bidii.advance") income += a;
    if (l.type === "advance_release") income += a;
    if (l.type === "bill" && l.pot_id === "bidii.bills") bills += -a;
    if (l.type === "commission") commissions += -a;
  }
  const reserve = (await getPots()).find((p) => p.id === "bidii.reserve")?.balance ?? 0;
  return {
    periodLabel: monthLabel(startsOn),
    startsOn,
    endsOn,
    income,
    bills,
    commissions,
    misses: {},
    reserveBalance: reserve,
    // Part of a month's bills is not a month's running costs, so the reserve
    // limit is left to the real month-end, not this estimate.
    monthlyRunningCosts: 0,
  };
}

export async function getRequests(): Promise<SpendRequest[]> {
  if (isDemo()) return demo.DEMO_REQUESTS;
  const sb = await supabaseServer();
  const { data } = await sb
    .from("requests")
    .select("*, pots(name), people:requester_id(slug, full_name)")
    .order("created_at", { ascending: false })
    .limit(100);
  const ids = (data ?? []).map((r) => r.id);
  const { data: approvals } = ids.length
    ? await sb.from("approvals").select("subject_id, decision, people:person_id(full_name)").eq("subject_type", "request").in("subject_id", ids)
    : { data: [] };
  return (data ?? []).map((r) => ({
    id: r.id,
    ledgerId: r.ledger_id,
    potId: r.pot_id,
    potName: r.pots?.name ?? r.pot_id,
    requesterSlug: r.people?.slug,
    requesterName: r.people?.full_name,
    amount: Number(r.amount),
    purpose: r.purpose,
    status: r.status,
    createdAt: r.created_at,
    receiptDueOn: r.receipt_due_on,
    hasReceipt: !!r.receipt_path,
    approvals: (approvals ?? [])
      .filter((a) => a.subject_id === r.id)
      .map((a) => ({ name: (a.people as unknown as { full_name: string })?.full_name, decision: a.decision })),
  }));
}

export async function getSchools(): Promise<School[]> {
  if (isDemo()) return demo.DEMO_SCHOOLS;
  const sb = await supabaseServer();
  const { data } = await sb
    .from("schools")
    .select("*, person:finder_person_id(full_name), referrer:finder_referrer_id(full_name)")
    .order("name");
  return (data ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    package: s.package,
    students: s.students,
    lowFee: s.low_fee,
    founding10: s.founding10,
    groupCampuses: s.group_campuses,
    status: s.status,
    signedOn: s.signed_on,
    finder: s.person
      ? { kind: "team", name: s.person.full_name }
      : s.referrer
        ? { kind: "outside", name: s.referrer.full_name }
        : null,
  }));
}

export async function getInvoices(): Promise<Invoice[]> {
  if (isDemo()) return demo.DEMO_INVOICES;
  const sb = await supabaseServer();
  const { data } = await sb
    .from("invoices")
    .select("*, schools(name), ledger_lines(amount)")
    .order("issued_on", { ascending: false })
    .limit(200);
  return (data ?? []).map((i) => ({
    id: i.id,
    number: i.number,
    schoolName: i.schools?.name,
    kind: i.kind,
    periodLabel: i.period_label,
    amount: Number(i.amount),
    paid: (i.ledger_lines ?? []).reduce((s: number, l: { amount: number }) => s + Number(l.amount), 0),
    issuedOn: i.issued_on,
    dueOn: i.due_on,
    status: i.status,
  }));
}

export async function getStatements(): Promise<Statement[]> {
  if (isDemo()) {
    const v = await getViewer();
    return v.role === "td_cofounder" ? demo.DEMO_STATEMENTS : demo.DEMO_STATEMENTS.filter((s) => s.personSlug === v.slug);
  }
  const sb = await supabaseServer();
  const { data } = await sb
    .from("statements")
    .select("*, periods(starts_on), people:person_id(slug, full_name)")
    .order("id", { ascending: false });
  return (data ?? []).map((s) => ({
    id: s.id,
    periodLabel: monthLabel(s.periods.starts_on),
    personName: s.people?.full_name,
    personSlug: s.people?.slug,
    status: s.status,
    total: Number(s.total),
    figures: s.figures,
  }));
}

export async function getComingUp(): Promise<{ items: ComingUpItem[]; warnings: string[] }> {
  if (isDemo()) {
    const v = await getViewer();
    return { items: demo.DEMO_COMING_UP, warnings: v.role === "td_cofounder" ? demo.DEMO_WARNINGS : [] };
  }
  const today = todayIso();
  const items: ComingUpItem[] = [];
  const warnings: string[] = [];
  for (const i of await getInvoices()) {
    if (i.status === "open" || i.status === "part_paid") {
      if (i.dueOn < today) warnings.push(`${i.schoolName} is late paying invoice ${i.number}.`);
      else items.push({ date: i.dueOn, label: `${i.schoolName}, invoice ${i.number} due`, kind: "invoice", amount: i.amount - i.paid });
    }
  }
  for (const r of await getRequests()) {
    if (r.status === "paid" && !r.hasReceipt && r.receiptDueOn) items.push({ date: r.receiptDueOn, label: `Receipt due: ${r.purpose}`, kind: "receipt" });
  }
  items.sort((a, b) => a.date.localeCompare(b.date));
  return { items: items.slice(0, 8), warnings };
}

/** People who hold approval permissions on a ledger. */
export async function getApprovers(ledgerId = "bidii"): Promise<Approver[]> {
  if (isDemo()) {
    return Object.values(demo.DEMO_VIEWERS).map((v) => ({
      slug: v.slug,
      name: v.name,
      approverLimit: (v.permissions[ledgerId] ?? []).includes("approver") ? v.approverLimit : null,
      secondSigner: (v.permissions[ledgerId] ?? []).includes("second_signer"),
    }));
  }
  const sb = await supabaseServer();
  const { data } = await sb
    .from("permissions")
    .select("permission, limit_kes, people:person_id(slug, full_name)")
    .eq("ledger_id", ledgerId)
    .in("permission", ["approver", "second_signer"]);
  const by = new Map<string, Approver>();
  for (const row of data ?? []) {
    const p = row.people as unknown as { slug: string; full_name: string };
    const a = by.get(p.slug) ?? { slug: p.slug, name: p.full_name, approverLimit: null, secondSigner: false };
    if (row.permission === "approver") a.approverLimit = Number(row.limit_kes ?? 0);
    if (row.permission === "second_signer") a.secondSigner = true;
    by.set(p.slug, a);
  }
  return [...by.values()];
}

function filterByViewer(pots: Pot[], v: Viewer) {
  return pots.filter((p) => v.ledgers.includes(p.ledgerId) && (!p.classAOnly || v.role === "td_cofounder"));
}

function demoSettingRows(): SettingRow[] {
  const row = (key: string, value: unknown, approvalRule: SettingRow["approvalRule"], reason: string): SettingRow => ({
    key,
    ledgerId: "bidii",
    value,
    approvalRule,
    effectiveFrom: "2026-01-01",
    reason,
  });
  return [
    row("split", DEFAULT_MONEY.split, "all_shareholders", "Bidii Shareholders' Agreement 7.4"),
    row("weights", DEFAULT_MONEY.weights, "all_shareholders", "Bidii Earnings and Pay Structure"),
    row("commission", { team: 0.03, outside: 0.05 }, "all_shareholders", "Agreed rates"),
    row("fee", { rate: 0.1 }, "both_classes", "Bidii Shareholders' Agreement 2.14"),
    row("requests", { singleApproverLimit: 20000, receiptDays: 3 }, "both_cofounders", "Bidii Earnings and Pay Structure"),
  ];
}
