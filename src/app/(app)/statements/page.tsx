import { Badge, Card, Empty, Money, PageHeader } from "@/components/ui";
import { getStatements, getViewer } from "@/lib/data/queries";

export const metadata = { title: "Statements" };

const STATUS = {
  prepared: { label: "Prepared, waiting for check", tone: "amber" },
  checked: { label: "Checked", tone: "grey" },
  paid: { label: "Paid", tone: "green" },
} as const;

export default async function StatementsPage() {
  const [viewer, statements] = await Promise.all([getViewer(), getStatements()]);
  const mine = statements.filter((s) => s.personSlug === viewer.slug);
  const others = statements.filter((s) => s.personSlug !== viewer.slug);

  return (
    <>
      <PageHeader title="Statements" subtitle="Every figure shows how it was worked out, so nothing is hidden. Nobody changes a figure by hand." />
      <div className="flex flex-col gap-5">
        <Card title="My statements">{mine.length === 0 ? <Empty>No statements yet. Your first one appears after the first month is closed.</Empty> : mine.map((s) => <StatementView key={s.id} s={s} />)}</Card>
        {others.length > 0 && (
          <Card title="Everyone's statements">
            <div className="flex flex-col gap-4">
              {others.map((s) => (
                <StatementView key={s.id} s={s} showName />
              ))}
            </div>
          </Card>
        )}
      </div>
    </>
  );
}

function StatementView({ s, showName }: { s: Awaited<ReturnType<typeof getStatements>>[number]; showName?: boolean }) {
  return (
    <details className="group rounded-2xl border border-line p-4 [&_summary::-webkit-details-marker]:hidden" open={!showName}>
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold">
            {showName ? `${s.personName} · ` : ""}
            {s.periodLabel}
          </p>
          <Badge tone={STATUS[s.status].tone}>{STATUS[s.status].label}</Badge>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted">Total cash</p>
          <Money amount={s.total} className="text-xl font-semibold" />
        </div>
      </summary>
      <dl className="mt-4 divide-y divide-line border-t border-line">
        {s.figures.map((f) => (
          <div key={f.label} className="grid grid-cols-[1fr_auto] gap-x-4 py-3">
            <dt className="font-medium">{f.label}</dt>
            <dd className="text-right">
              <Money amount={f.amount} />
            </dd>
            <dd className="col-span-2 mt-0.5 text-sm text-muted">{f.how}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
