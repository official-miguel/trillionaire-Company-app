import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge, Card, Money, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { can, getSchools, getViewer } from "@/lib/data/queries";
import { getOpenInvoices, getPayment } from "@/lib/mpesa/queries";
import { dateTime, kes } from "@/lib/format";
import { MATCH_METHOD, PAYMENT_STATUS } from "../status";
import { reconcilePayment, reversePayment } from "../actions";

export const metadata = { title: "M-PESA payment" };

const MESSAGES: Record<string, [string, "ok" | "warn"]> = {
  "done=reconciled": ["Reconciled. The money is on Bidii's ledger and the invoice is updated.", "ok"],
  "done=reversed": ["Recorded as reversed. Anything credited has been taken back with a refund line.", "ok"],
  "done=demo": ["Demo mode: nothing was changed.", "ok"],
  "error=not-allowed": ["Only people who can edit the ledger can do that.", "warn"],
};

const field = "rounded-full border border-line bg-white px-4 py-2.5 text-base font-normal outline-none focus:border-lime";

export default async function PaymentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const [viewer, { id }, query] = await Promise.all([getViewer(), params, searchParams]);
  if (!viewer.isOwner && !viewer.ledgers.includes("bidii")) redirect("/");
  const payment = await getPayment(id);
  if (!payment) notFound();

  const editor = can(viewer, "bidii", "ledger_editor");
  const canMatch = editor && (payment.status === "unmatched" || payment.status === "review") && payment.amount > 0;
  const [invoices, schools] = canMatch ? await Promise.all([getOpenInvoices(), getSchools()]) : [[], []];
  const status = PAYMENT_STATUS[payment.status];

  const [key, value] = Object.entries(query)[0] ?? [];
  const message = MESSAGES[`${key}=${value}`] ?? (key === "error" && value ? ([value, "warn"] as const) : null);

  return (
    <>
      <PageHeader
        title={`${kes(payment.amount)} · ${payment.receipt}`}
        subtitle={`Paid ${dateTime(payment.paidAt)}${payment.payerName ? ` by ${payment.payerName}` : ""}`}
        action={
          <Link href="/payments" className="text-sm text-muted hover:text-ink">
            All payments
          </Link>
        }
      />
      {message && <p className={`mb-5 rounded-2xl px-4 py-3 text-sm ${message[1] === "ok" ? "bg-lime-soft" : "bg-warn-soft text-warn"}`}>{message[0]}</p>}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        <div className="flex flex-col gap-5 lg:col-span-3">
          <Card title="Payment" action={<Badge tone={status.tone}>{status.label}</Badge>}>
            {payment.note && <p className="mb-4 rounded-2xl bg-surface px-3 py-2.5 text-sm">{payment.note}</p>}
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <Row label="M-PESA receipt">
                <span className="font-mono">{payment.receipt}</span>
              </Row>
              <Row label="Amount">
                <Money amount={payment.amount} className="font-semibold" />
              </Row>
              <Row label="Paid">{dateTime(payment.paidAt)}</Row>
              <Row label="Payer">{payment.payerName ?? "—"}</Row>
              <Row label="Phone">{payment.phone ?? "—"}</Row>
              <Row label="Account number typed">{payment.accountRef ?? "—"}</Row>
              <Row label="Type">{payment.transactionType ?? "—"}</Row>
              <Row label="Paid to shortcode">{payment.shortcode ?? "—"}</Row>
              <Row label="Matched to">
                {payment.schoolName ? (
                  <Link href="/schools" className="underline decoration-line decoration-2 underline-offset-4 hover:decoration-lime">
                    {payment.schoolName}
                    {payment.invoiceNumber ? ` · invoice ${payment.invoiceNumber}` : ""}
                  </Link>
                ) : (
                  "—"
                )}
                {payment.matchMethod && payment.status === "matched" && <span className="text-muted"> ({MATCH_METHOD[payment.matchMethod]})</span>}
              </Row>
              <Row label="On the ledger">
                {payment.ledgerLineId ? (
                  <Link href="/money?ledger=bidii&type=money_in" className="underline decoration-line decoration-2 underline-offset-4 hover:decoration-lime">
                    Money in, matched to M-PESA
                  </Link>
                ) : (
                  "Not credited"
                )}
                {payment.reversalLineId && " · refunded"}
              </Row>
              {payment.reconciledBy && (
                <Row label="Reconciled by">
                  {payment.reconciledBy}
                  {payment.reconciledAt ? `, ${dateTime(payment.reconciledAt)}` : ""}
                </Row>
              )}
            </dl>
          </Card>

          {canMatch && (
            <Card title="Reconcile by hand">
              <form action={reconcilePayment} className="flex flex-col gap-4">
                <input type="hidden" name="id" value={payment.id} />
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  Credit it to
                  <select name="target" required defaultValue={payment.invoiceId ? `invoice:${payment.invoiceId}` : ""} className={field}>
                    <option value="" disabled>
                      Choose an invoice, a school, or other money in
                    </option>
                    <optgroup label="Invoices still owed">
                      {invoices.map((i) => (
                        <option key={i.id} value={`invoice:${i.id}`}>
                          {i.number} · {i.schoolName} · owes {kes(i.owed)}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="A school (no invoice)">
                      {schools.map((s) => (
                        <option key={s.id} value={`school:${s.id}`}>
                          {s.name}
                        </option>
                      ))}
                    </optgroup>
                    <option value="none">Other money in (not a school)</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  Why
                  <input name="note" required placeholder="For example: their bursar paid from her own phone" className={field} />
                </label>
                <div>
                  <SubmitButton pending="Reconciling…">Reconcile and credit {kes(payment.amount)}</SubmitButton>
                </div>
              </form>
            </Card>
          )}

          {editor && payment.status !== "reversed" && (
            <Card title="Reversed on M-PESA?">
              <form action={reversePayment} className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <input type="hidden" name="id" value={payment.id} />
                <label className="flex flex-1 flex-col gap-1.5 text-sm font-medium">
                  Reason
                  <input name="reason" required placeholder="For example: refunded, paid twice by mistake" className={field} />
                </label>
                <SubmitButton pending="Saving…" className="shrink-0 whitespace-nowrap rounded-full border border-line px-5 py-2.5 text-sm font-semibold text-danger hover:border-danger/40">
                  Record reversal
                </SubmitButton>
              </form>
              <p className="mt-2 text-xs text-muted">
                Use this after Safaricom reverses the payment. If it was credited, a refund line takes it back off the invoice; nothing is deleted.
              </p>
            </Card>
          )}
        </div>

        <Card title="Audit trail" className="lg:col-span-2">
          <ol className="flex flex-col gap-4">
            {payment.trail.map((t, i) => (
              <li key={i} className="border-l-2 border-line pl-3 text-sm">
                <p className="font-medium">{t.action}</p>
                <p className="text-muted">
                  {dateTime(t.at)} · {t.who ?? "Safaricom (automatic)"}
                </p>
                {typeof t.details.note === "string" && t.details.note && <p className="mt-0.5 text-ink/80">{t.details.note}</p>}
                {typeof t.details.reason === "string" && <p className="mt-0.5 text-ink/80">{t.details.reason}</p>}
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}
