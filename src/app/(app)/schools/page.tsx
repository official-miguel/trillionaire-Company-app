import { Badge, Card, Empty, Money, PageHeader } from "@/components/ui";
import { can, getInvoices, getSchools, getSettings, getViewer } from "@/lib/data/queries";
import { invoiceTotal, subscriptionInvoice, termlyTotal } from "@/lib/money/pricing";
import { daysUntil, shortDate } from "@/lib/format";

export const metadata = { title: "Schools & invoices" };

const PACKAGE = { monthly: "Monthly", termly: "Termly", yearly: "Yearly", buy_it_once: "Buy-It-Once" };
const INVOICE_STATUS = {
  open: { label: "Open", tone: "amber" },
  part_paid: { label: "Part paid", tone: "amber" },
  paid: { label: "Paid", tone: "green" },
  written_off: { label: "Written off", tone: "grey" },
  credited: { label: "Credited", tone: "grey" },
} as const;

export default async function SchoolsPage() {
  const [viewer, schools, invoices, { pricing, commission }] = await Promise.all([getViewer(), getSchools(), getInvoices(), getSettings()]);
  const assigner = can(viewer, "bidii", "commission_assigner");
  const owed = invoices.filter((i) => i.status === "open" || i.status === "part_paid");
  const owedTotal = owed.reduce((s, i) => s + i.amount - i.paid, 0);

  return (
    <>
      <PageHeader
        title="Schools & invoices"
        subtitle="School details come from the Bidii super admin. Invoices are made automatically from each school's package."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Paying schools" value={String(schools.filter((s) => s.status === "paying").length)} />
        <Stat label="Students billed" value={schools.reduce((s, x) => s + x.students, 0).toLocaleString("en-KE")} />
        <Stat label="Still owed" value={<Money amount={owedTotal} />} />
        <Stat label="Late invoices" value={String(owed.filter((i) => daysUntil(i.dueOn) < 0).length)} />
      </div>

      <Card title="Schools" className="mb-5">
        {schools.length === 0 ? (
          <Empty>No schools yet. They appear here once they are signed in the Bidii super admin.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {schools.map((s) => {
              const next = s.package === "buy_it_once" ? null : invoiceTotal(subscriptionInvoice({ students: s.students, package: s.package, lowFee: s.lowFee, groupCampuses: s.groupCampuses ?? 0 }, {}, pricing));
              return (
                <li key={s.id} className="grid grid-cols-1 gap-2 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div>
                    <p className="font-medium">
                      {s.name}{" "}
                      {s.founding10 && <Badge tone="green">Founding 10</Badge>} {s.lowFee && <Badge>Low-fee cap</Badge>}{" "}
                      {(s.groupCampuses ?? 0) >= pricing.groupMinCampuses && <Badge>Group of {s.groupCampuses}</Badge>}
                    </p>
                    <p className="mt-0.5 text-sm text-muted">
                      {PACKAGE[s.package]} · {s.students} students · term total {termlyTotal(s.students, s.lowFee, pricing).toLocaleString("en-KE")}
                      {s.signedOn ? ` · signed ${shortDate(s.signedOn)}` : ""}
                    </p>
                    <p className="mt-0.5 text-sm">
                      {s.finder ? (
                        <>
                          Found by {s.finder.name}{" "}
                          <span className="text-muted">
                            ({s.finder.kind === "outside" ? "outside referrer" : "team"}, {Math.round(commission[s.finder.kind === "outside" ? "outside" : "team"] * 100)}% of first-year payments)
                          </span>
                        </>
                      ) : (
                        <span className="text-warn">No finder recorded{assigner ? " — set it so commission can be paid" : ""}</span>
                      )}
                    </p>
                  </div>
                  {next !== null && (
                    <div className="text-left sm:text-right">
                      <p className="text-xs text-muted">Each {s.package === "monthly" ? "school month" : s.package === "termly" ? "term" : "year"}</p>
                      <Money amount={next} className="font-semibold" />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card title="Invoices">
        {invoices.length === 0 ? (
          <Empty>No invoices yet.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {invoices.map((i) => {
              const late = (i.status === "open" || i.status === "part_paid") && daysUntil(i.dueOn) < 0;
              return (
                <li key={i.id} className="flex flex-col gap-1 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium">
                      {i.number} · {i.schoolName}
                    </p>
                    <p className={`text-sm ${late ? "text-warn" : "text-muted"}`}>
                      {i.periodLabel} · {i.kind === "onboarding" ? "Onboarding fee" : "Subscription"} · due {shortDate(i.dueOn)}
                      {late ? `, ${-daysUntil(i.dueOn)} days late` : ""}
                      {i.status === "part_paid" ? ` · ${i.paid.toLocaleString("en-KE")} paid` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge tone={INVOICE_STATUS[i.status].tone}>{INVOICE_STATUS[i.status].label}</Badge>
                    <Money amount={i.amount} className="font-semibold" />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="card px-4 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="tabular mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}
