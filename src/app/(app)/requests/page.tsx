import { Badge, Card, Empty, Money, PageHeader } from "@/components/ui";
import { getApprovers, getPots, getRequests, getViewer } from "@/lib/data/queries";
import { approvalNeed } from "@/lib/money/approvals";
import { daysUntil, shortDate, todayIso } from "@/lib/format";
import { askForMoney, decide } from "./actions";
import { SubmitButton } from "@/components/SubmitButton";

export const metadata = { title: "Requests" };

const STATUS = {
  waiting: { label: "Waiting", tone: "amber" },
  approved: { label: "Approved", tone: "green" },
  rejected: { label: "Not approved", tone: "red" },
  paid: { label: "Paid out", tone: "grey" },
  closed: { label: "Closed", tone: "grey" },
} as const;

const MESSAGES: Record<string, string> = {
  "sent=1": "Your request was sent. You'll see it below until it is approved.",
  "sent=demo": "Demo mode: nothing was saved. With real data, your request would now wait for approval.",
  "decided=demo": "Demo mode: nothing was saved.",
  "error=missing": "Fill in the amount, what it is for, and which pot it comes from.",
  "error=save": "The request couldn't be saved. Try again.",
  "error=not-yours": "You can't approve this request.",
};

export default async function RequestsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const [viewer, requests, approvers, pots, params] = await Promise.all([getViewer(), getRequests(), getApprovers(), getPots(), searchParams]);
  const message = Object.entries(params).map(([k, v]) => MESSAGES[`${k}=${v}`]).find(Boolean);
  const spendPots = pots.filter((p) => ["growth", "product", "fee"].includes(p.key));
  const sample = approvalNeed({ requesterSlug: viewer.slug, amount: 5000, potKey: "growth", approvedBy: [] }, approvers);

  const forMe = requests.filter((r) => {
    if (r.status !== "waiting") return false;
    const need = approvalNeed(needFacts(r, approvers), approvers);
    return need.eligible.some((a) => a.slug === viewer.slug) && !r.approvals.some((a) => a.name === viewer.name);
  });

  return (
    <>
      <PageHeader title="Requests" subtitle="Nobody has a fixed allowance. Ask for what you need, and upload the receipt within 3 days." />
      {message && <p className="mb-5 rounded-2xl bg-lime-soft px-4 py-3 text-sm text-ink">{message}</p>}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        <Card title="Ask for money" className="lg:col-span-2">
          <form action={askForMoney} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Amount (KES)
              <input name="amount" type="number" min="1" step="1" required inputMode="numeric" className="rounded-full border border-line px-4 py-3 text-base font-normal outline-none focus:border-lime" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              What is it for?
              <textarea name="purpose" required rows={3} placeholder="For example: matatu fare for 4 school visits in Murang'a" className="rounded-2xl border border-line px-4 py-3 text-base font-normal outline-none focus:border-lime" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Which pot pays for it?
              <select name="pot" required className="rounded-full border border-line bg-white px-4 py-3 text-base font-normal outline-none focus:border-lime">
                {spendPots.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}, {p.balance.toLocaleString("en-KE")} left
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm text-ink/80">
              <input type="checkbox" name="personal" className="h-4 w-4 accent-[#32cd32]" />
              This is a personal cost (it will be taken back from my next pay)
            </label>
            <SubmitButton pending="Sending…">Send request</SubmitButton>
            <p className="text-xs text-muted">{sample.summary} Above KES 20,000, or from the reserve, two people approve.</p>
          </form>
        </Card>

        <div className="flex flex-col gap-5 lg:col-span-3">
          {forMe.length > 0 && (
            <Card title={`Waiting for you (${forMe.length})`}>
              <ul className="flex flex-col gap-3">
                {forMe.map((r) => (
                  <li key={r.id} className="rounded-2xl border border-line p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{r.purpose}</p>
                        <p className="mt-0.5 text-sm text-muted">
                          {r.requesterName} · {r.potName} · {shortDate(r.createdAt)}
                        </p>
                      </div>
                      <Money amount={r.amount} className="font-semibold" />
                    </div>
                    <p className="mt-2 text-xs text-muted">{approvalNeed(needFacts(r, approvers), approvers).summary}</p>
                    <form action={decide} className="mt-3 flex gap-2">
                      <input type="hidden" name="id" value={r.id} />
                      <SubmitButton name="decision" value="approve" pending="Approving…" className="rounded-full bg-lime px-4 py-2 text-sm font-semibold text-ink hover:brightness-95">
                        Approve
                      </SubmitButton>
                      <SubmitButton name="decision" value="reject" pending="Saving…" className="rounded-full border border-line px-4 py-2 text-sm font-semibold hover:border-ink/30">
                        Don&apos;t approve
                      </SubmitButton>
                    </form>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card title="All requests">
            {requests.length === 0 ? (
              <Empty>No requests yet.</Empty>
            ) : (
              <ul className="divide-y divide-line">
                {requests.map((r) => {
                  const need = approvalNeed(needFacts(r, approvers), approvers);
                  const receiptLate = r.status === "paid" && !r.hasReceipt && r.receiptDueOn && r.receiptDueOn <= todayIso();
                  return (
                    <li key={r.id} className="flex flex-col gap-1 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{r.purpose}</p>
                        <p className="text-sm text-muted">
                          {r.requesterName} · {r.potName} · {shortDate(r.createdAt)}
                          {r.status === "waiting" && ` · ${r.approvals.filter((a) => a.decision === "approve").length} of ${need.needed} approvals`}
                        </p>
                        {receiptLate && (
                          <p className="text-sm text-warn">
                            Receipt {daysUntil(r.receiptDueOn!) === 0 ? "due today" : "late"}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-3 sm:justify-end">
                        <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
                        <Money amount={r.amount} className="font-semibold" />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

function needFacts(r: { requesterSlug: string; amount: number; potId: string; approvals: { name: string; decision: string }[] }, approvers: { slug: string; name: string }[]) {
  return {
    requesterSlug: r.requesterSlug,
    amount: r.amount,
    potKey: r.potId.split(".")[1],
    approvedBy: r.approvals.filter((a) => a.decision === "approve").map((a) => approvers.find((p) => p.name === a.name)?.slug ?? ""),
  };
}
