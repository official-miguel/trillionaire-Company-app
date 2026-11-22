import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge, Card, Empty, Money, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { can, getViewer } from "@/lib/data/queries";
import { getOpenCallbacks, getPayments, getPaymentSummary } from "@/lib/mpesa/queries";
import type { PaymentFilters } from "@/lib/mpesa/types";
import { dateTime, kes } from "@/lib/format";
import { PAYMENT_STATUS } from "./status";
import { retryCallback } from "./actions";

export const metadata = { title: "M-PESA payments" };

const STATUSES = ["matched", "unmatched", "review", "pending", "failed", "reversed"] as const;

const MESSAGES: Record<string, [string, "ok" | "warn"]> = {
  "done=retried": ["Processed. The payment is now in the list.", "ok"],
  "done=still-failing": ["Tried again, and it still fails. The reason is shown below.", "warn"],
  "done=demo": ["Demo mode: nothing was changed.", "ok"],
  "error=not-allowed": ["Only people who can edit the ledger can do that.", "warn"],
};

const field = "rounded-full border border-line bg-white px-4 py-2.5 text-sm outline-none focus:border-lime";

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const [viewer, params] = await Promise.all([getViewer(), searchParams]);
  if (!viewer.isOwner && !viewer.ledgers.includes("bidii")) redirect("/");

  const status = (STATUSES as readonly string[]).includes(params.status) ? (params.status as PaymentFilters["status"]) : undefined;
  const filters: PaymentFilters = { from: params.from, to: params.to, q: params.q, status };
  const [summary, payments, callbacks] = await Promise.all([
    getPaymentSummary(filters),
    getPayments(filters),
    status === "failed" || status === "pending" ? getOpenCallbacks() : Promise.resolve([]),
  ]);
  const editor = can(viewer, "bidii", "ledger_editor");

  const link = (s?: string) => {
    const q = new URLSearchParams(Object.entries({ from: params.from, to: params.to, q: params.q, status: s }).filter(([, v]) => v) as [string, string][]).toString();
    return `/payments${q ? `?${q}` : ""}`;
  };
  const doneKey = params.done ? `done=${params.done}` : params.error === "not-allowed" ? "error=not-allowed" : "";
  const message = MESSAGES[doneKey] ?? (params.error && params.error !== "not-allowed" ? ([params.error, "warn"] as const) : null);
  const shownCallbacks = callbacks.filter((c) => (status === "failed" ? c.status === "failed" : c.status === "pending"));
  const listTitle = !status ? "Recent M-PESA payments" : status === "pending" ? "Pending payments" : status === "failed" ? "" : `${PAYMENT_STATUS[status].label} payments`;

  return (
    <>
      <PageHeader
        title="M-PESA payments"
        subtitle="Every payment Safaricom confirms, matched to schools and invoices automatically. Anything that can't be matched waits here for a person."
        action={
          can(viewer, "bidii", "settings_editor") ? (
            <Link href="/settings/mpesa" className="rounded-full border border-line px-4 py-2 text-sm font-semibold hover:border-ink/30">
              Daraja settings
            </Link>
          ) : undefined
        }
      />
      {message && <p className={`mb-5 rounded-2xl px-4 py-3 text-sm ${message[1] === "ok" ? "bg-lime-soft" : "bg-warn-soft text-warn"}`}>{message[0]}</p>}

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Payments received" value={String(summary.count)} href={link()} active={!status} />
        <Stat label="Reconciled" value={String(summary.matched)} href={link("matched")} active={status === "matched"} />
        <Stat label="Not matched" value={String(summary.unmatched)} href={link("unmatched")} active={status === "unmatched"} warn={summary.unmatched > 0} />
        <Stat label="Needs review" value={String(summary.review)} href={link("review")} active={status === "review"} warn={summary.review > 0} />
        <Stat label="Pending" value={String(summary.pending)} href={link("pending")} active={status === "pending"} />
        <Stat label="Failed" value={String(summary.failed)} href={link("failed")} active={status === "failed"} warn={summary.failed > 0} />
        <Stat label="Total received" value={kes(summary.total)} />
        <Stat label="Credited to invoices" value={kes(summary.matchedTotal)} />
      </div>

      <form className="card mb-5 grid grid-cols-2 gap-3 p-4 sm:grid-cols-[auto_auto_1fr_auto] sm:items-end" role="search">
        {status && <input type="hidden" name="status" value={status} />}
        <label className="flex flex-col gap-1 text-xs text-muted">
          From
          <input type="date" name="from" defaultValue={params.from} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          To
          <input type="date" name="to" defaultValue={params.to} className={field} />
        </label>
        <label className="col-span-2 flex flex-col gap-1 text-xs text-muted sm:col-span-1">
          Search
          <input type="search" name="q" defaultValue={params.q} placeholder="Receipt, phone, name or account number" className={field} />
        </label>
        <div className="col-span-2 flex gap-2 sm:col-span-1">
          <button className="rounded-full bg-lime px-5 py-2.5 text-sm font-semibold text-ink hover:brightness-95">Filter</button>
          {(params.from || params.to || params.q || status) && (
            <Link href="/payments" className="rounded-full border border-line px-4 py-2.5 text-sm font-semibold">
              Clear
            </Link>
          )}
        </div>
      </form>

      {(status === "failed" || status === "pending") && (
        <Card title={status === "failed" ? "Callbacks that failed" : "Callbacks waiting to be processed"} className="mb-5">
          {shownCallbacks.length === 0 ? (
            <Empty>{status === "failed" ? "No failed callbacks." : "Nothing waiting."}</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {shownCallbacks.map((c) => (
                <li key={c.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm">
                    <p className="font-medium">
                      {c.receipt ?? "No receipt number"} {c.amount && <span className="text-muted">· KES {c.amount}</span>}
                    </p>
                    <p className="text-muted">
                      {dateTime(c.receivedAt)} · tried {c.attempts}× {c.error ? `· ${c.error}` : ""}
                    </p>
                  </div>
                  {editor && (
                    <form action={retryCallback}>
                      <input type="hidden" name="id" value={c.id} />
                      <SubmitButton pending="Trying…" className="rounded-full border border-line px-4 py-2 text-sm font-semibold hover:border-ink/30">
                        Try again
                      </SubmitButton>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {status !== "failed" && (
        <Card title={listTitle}>
          {payments.length === 0 ? (
            <Empty>No payments here yet. They appear the moment Safaricom confirms one.</Empty>
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted">
                    <tr className="border-b border-line">
                      <th className="py-2 pr-3 font-medium">Paid</th>
                      <th className="py-2 pr-3 font-medium">Receipt</th>
                      <th className="py-2 pr-3 font-medium">From</th>
                      <th className="py-2 pr-3 font-medium">Matched to</th>
                      <th className="py-2 pr-3 font-medium">Status</th>
                      <th className="py-2 text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {payments.map((p) => (
                      <tr key={p.id} className="hover:bg-surface/60">
                        <td className="whitespace-nowrap py-3 pr-3 text-muted">{dateTime(p.paidAt)}</td>
                        <td className="py-3 pr-3">
                          <Link href={`/payments/${p.id}`} className="font-mono font-medium underline decoration-line decoration-2 underline-offset-4 hover:decoration-lime">
                            {p.receipt}
                          </Link>
                        </td>
                        <td className="py-3 pr-3">
                          <p>{p.payerName ?? "—"}</p>
                          <p className="text-xs text-muted">{[p.phone, p.accountRef && `account ${p.accountRef}`].filter(Boolean).join(" · ")}</p>
                        </td>
                        <td className="py-3 pr-3">{p.schoolName ? `${p.schoolName}${p.invoiceNumber ? ` · ${p.invoiceNumber}` : ""}` : <span className="text-muted">—</span>}</td>
                        <td className="py-3 pr-3">
                          <Badge tone={PAYMENT_STATUS[p.status].tone}>{PAYMENT_STATUS[p.status].label}</Badge>
                        </td>
                        <td className="py-3 text-right">
                          <Money amount={p.amount} className="font-medium" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="divide-y divide-line md:hidden">
                {payments.map((p) => (
                  <li key={p.id}>
                    <Link href={`/payments/${p.id}`} className="flex items-start justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{p.schoolName ?? p.payerName ?? p.phone ?? "Unknown payer"}</p>
                        <p className="text-xs text-muted">
                          <span className="font-mono">{p.receipt}</span> · {dateTime(p.paidAt)}
                        </p>
                        <div className="mt-1">
                          <Badge tone={PAYMENT_STATUS[p.status].tone}>{PAYMENT_STATUS[p.status].label}</Badge>
                        </div>
                      </div>
                      <Money amount={p.amount} className="text-sm font-medium" />
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      )}
    </>
  );
}

function Stat({ label, value, href, active, warn }: { label: string; value: string; href?: string; active?: boolean; warn?: boolean }) {
  const body = (
    <>
      <p className="text-xs text-muted">{label}</p>
      <p className={`tabular mt-1 text-lg font-semibold ${warn ? "text-warn" : ""}`}>{value}</p>
    </>
  );
  return href ? (
    <Link href={href} className={`card px-4 py-3 transition hover:border-lime ${active ? "border-lime" : ""}`}>
      {body}
    </Link>
  ) : (
    <div className="card px-4 py-3">{body}</div>
  );
}
