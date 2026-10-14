import Link from "next/link";
import { LedgerSwitch } from "@/components/LedgerSwitch";
import { Badge, Card, Empty, Money, PageHeader } from "@/components/ui";
import { can, getLedgerLines, getPots, getViewer } from "@/lib/data/queries";
import type { LineType } from "@/lib/data/types";
import { kes, shortDate } from "@/lib/format";

export const metadata = { title: "Money" };

const LEDGER_NAMES: Record<string, string> = { bidii: "Bidii", company: "Trillionaire Designs" };

const TYPES: Record<LineType, string> = {
  money_in: "Money in",
  bill: "Bill",
  commission: "Commission",
  pay: "Pay",
  fee: "Fee",
  transfer: "Transfer",
  refund: "Refund",
  advance_held: "Advance held",
  advance_release: "Advance released",
};

const STATUS = {
  draft: { label: "Draft", tone: "amber" },
  approved: { label: "Approved", tone: "grey" },
  reconciled: { label: "Matched to bank", tone: "green" },
} as const;

export default async function MoneyPage({ searchParams }: { searchParams: Promise<{ ledger?: string; pot?: string; type?: string }> }) {
  const [viewer, params, pots] = await Promise.all([getViewer(), searchParams, getPots()]);
  const ledgerId = params.ledger && viewer.ledgers.includes(params.ledger) ? params.ledger : (params.pot?.split(".")[0] ?? "bidii");
  const visible = viewer.ledgers.includes(ledgerId) ? ledgerId : "bidii";
  let lines = await getLedgerLines(visible);
  if (params.pot) lines = lines.filter((l) => l.potId === params.pot);
  if (params.type) lines = lines.filter((l) => l.type === params.type);
  const ledgerPots = pots.filter((p) => p.ledgerId === visible);
  const filter = params.pot ? pots.find((p) => p.id === params.pot)?.name : params.type ? TYPES[params.type as LineType] : null;
  const total = lines.reduce((s, l) => s + l.amount, 0);

  return (
    <>
      <PageHeader title="Money" subtitle="Every shilling is a line in a ledger. Nothing is deleted: a change keeps the old value, who made it and why." />

      {viewer.ledgers.length > 1 && <LedgerSwitch key={visible} ledgers={viewer.ledgers} current={visible} names={LEDGER_NAMES} />}

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {ledgerPots.map((p) => (
          <Link key={p.id} href={`/money?pot=${p.id}`} className={`card px-4 py-3 transition hover:border-lime ${params.pot === p.id ? "border-lime" : ""}`}>
            <p className="text-xs text-muted">{p.name}</p>
            <p className="tabular mt-1 font-semibold">{kes(p.balance)}</p>
          </Link>
        ))}
      </div>

      <Card
        title={filter ? `${LEDGER_NAMES[visible]} · ${filter}` : `${LEDGER_NAMES[visible]} ledger`}
        action={
          <div className="flex items-center gap-3">
            {filter && (
              <Link href={`/money?ledger=${visible}`} className="text-sm text-muted hover:text-ink">
                Clear filter
              </Link>
            )}
            {can(viewer, visible, "ledger_editor") && (
              <Link href={`/money/new?ledger=${visible}`} className="rounded-full bg-lime px-4 py-2 text-sm font-semibold text-ink hover:brightness-95">
                Add a line
              </Link>
            )}
          </div>
        }
      >
        {lines.length === 0 ? (
          <Empty>No lines here yet.</Empty>
        ) : (
          <>
            {/* Laptop: table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted">
                  <tr className="border-b border-line">
                    <th className="py-2 pr-3 font-medium">Date</th>
                    <th className="py-2 pr-3 font-medium">What</th>
                    <th className="py-2 pr-3 font-medium">Type</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {lines.map((l) => (
                    <tr key={l.id}>
                      <td className="whitespace-nowrap py-3 pr-3 text-muted">{shortDate(l.occurredOn)}</td>
                      <td className="py-3 pr-3">
                        <p>{l.description}</p>
                        <p className="text-xs text-muted">
                          {[l.who, l.hasReceipt ? "receipt attached" : null, l.edits ? `changed ${l.edits}×` : null].filter(Boolean).join(" · ")}
                        </p>
                      </td>
                      <td className="whitespace-nowrap py-3 pr-3">{TYPES[l.type]}</td>
                      <td className="py-3 pr-3">
                        <Badge tone={STATUS[l.status].tone}>{STATUS[l.status].label}</Badge>
                      </td>
                      <td className="py-3 text-right">
                        <Money amount={l.amount} className="font-medium" />
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-line">
                    <td colSpan={4} className="pt-3 text-sm text-muted">
                      {lines.length} lines
                    </td>
                    <td className="pt-3 text-right font-semibold">
                      <Money amount={total} />
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {/* Phone: list */}
            <ul className="divide-y divide-line md:hidden">
              {lines.map((l) => (
                <li key={l.id} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="text-sm">{l.description}</p>
                    <p className="text-xs text-muted">
                      {shortDate(l.occurredOn)} · {TYPES[l.type]}
                      {l.who ? ` · ${l.who}` : ""}
                    </p>
                    <div className="mt-1">
                      <Badge tone={STATUS[l.status].tone}>{STATUS[l.status].label}</Badge>
                    </div>
                  </div>
                  <Money amount={l.amount} className="text-sm font-medium" />
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </>
  );
}
