import Link from "next/link";
import { Badge, Card, Money } from "@/components/ui";
import { AlertIcon, ArrowIcon } from "@/components/icons";
import { getComingUp, getMonthToDate, getPots, getRecentChanges, getSettings, getViewer } from "@/lib/data/queries";
import { closeMonth, POT_LABELS, type PotKey } from "@/lib/money/monthEnd";
import { daysUntil, kes, shortDate } from "@/lib/format";

export const metadata = { title: "Home" };

const POT_COLORS = ["#32cd32", "#0a0a0a", "#9be89b", "#5c5c5c", "#c9f2c9", "#a3a3a3"];

export default async function HomePage() {
  const [viewer, month, pots, { money, commission }, coming, changes] = await Promise.all([
    getViewer(),
    getMonthToDate(),
    getPots(),
    getSettings(),
    getComingUp(),
    getRecentChanges(7),
  ]);

  const today = closeMonth(month, money);
  const me = today.people[viewer.slug] ?? { poolPay: 0, poolCut: 0, payout: 0 };
  const estimate = me.poolPay + me.payout;
  const payoutDate = nextPayout(month.endsOn);
  const firstName = viewer.name.split(" ")[0];
  const potTotal = pots.reduce((s, p) => s + Math.max(0, p.balance), 0);
  const classA = viewer.role === "td_cofounder";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">{month.periodLabel}</p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{greeting()}, {firstName}</h1>
        </div>
        <Badge tone="green">{daysUntil(payoutDate)} days to payout, {shortDate(payoutDate)}</Badge>
      </div>

      {changes.length > 0 && (
        <Link href="/settings" className="block rounded-2xl border border-line bg-white px-4 py-3 text-sm hover:border-lime">
          <span className="font-medium">{changes[0].who.split(" ")[0]} changed {changes[0].label}</span>
          <span className="text-muted"> · {shortDate(changes[0].at)} · {changes[0].reason}</span>
          {changes.length > 1 && <span className="text-muted"> · and {changes.length - 1} more this week</span>}
        </Link>
      )}

      {/* 1. What I would earn today: the one dark card on the page */}
      <section className="rounded-[1.5rem] bg-ink p-6 text-white sm:p-8">
        <p className="text-sm text-white/60">What I would earn if money were shared today</p>
        <p className="tabular mt-2 text-4xl font-semibold tracking-tight sm:text-5xl">{kes(estimate)}</p>
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Part label="Pool pay" value={me.poolPay} note={me.poolCut ? `${kes(me.poolCut)} held back for missed tasks` : `Weight ${money.weights[viewer.slug] ?? 0} of ${Object.values(money.weights).reduce((a, b) => a + b, 0)}`} />
          <Part label="Owners' payout" value={me.payout} note="On your issued shares" />
          <Part label="Commission" value={0} note={`${Math.round(commission.team * 100)}% of first-year payments from schools you found, once they pay`} />
        </div>
        <p className="mt-5 text-xs leading-relaxed text-white/50">
          This is an estimate, not a promise. It counts the money and bills so far this month and assumes your open tasks get done. Nobody is paid until the month is closed and checked.
        </p>
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        {/* 2. Where the money is */}
        <Card title="Where the money is" className="lg:col-span-3" action={<Link href="/money" className="text-sm font-medium text-lime-deep">Open ledgers</Link>}>
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface" role="img" aria-label="Share of money in each pot">
            {pots.map((p, i) => (
              <span key={p.id} style={{ width: `${(Math.max(0, p.balance) / (potTotal || 1)) * 100}%`, background: POT_COLORS[i % POT_COLORS.length] }} />
            ))}
          </div>
          <ul className="mt-4 divide-y divide-line">
            {pots.map((p, i) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="flex items-center gap-2.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: POT_COLORS[i % POT_COLORS.length] }} />
                  {p.name}
                  {p.classAOnly && <Badge>Class A</Badge>}
                </span>
                <Money amount={p.balance} href={`/money?pot=${p.id}`} className="font-medium" />
              </li>
            ))}
          </ul>
          {!classA && <p className="mt-3 text-xs text-muted">You see Bidii&apos;s pots. Trillionaire Designs&apos; own money is shown only to Class A.</p>}
        </Card>

        {/* 4. Coming up */}
        <Card title="Coming up" className="lg:col-span-2">
          {coming.warnings.length > 0 && (
            <ul className="mb-4 flex flex-col gap-2">
              {coming.warnings.map((w) => (
                <li key={w} className="flex gap-2 rounded-2xl bg-warn-soft px-3 py-2.5 text-sm text-warn">
                  <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
                  {w}
                </li>
              ))}
            </ul>
          )}
          <ul className="flex flex-col gap-3">
            {coming.items.map((c) => (
              <li key={c.label} className="flex items-start justify-between gap-3 text-sm">
                <span className="flex gap-3">
                  <span className="w-12 shrink-0 text-muted">{shortDate(c.date)}</span>
                  <span>{c.label}</span>
                </span>
                {c.amount !== undefined && <span className="tabular shrink-0 text-ink/70">{kes(c.amount)}</span>}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* 3. This month so far */}
      <Card title="This month so far" action={<span className="text-xs text-muted">So everyone sees where the estimate comes from</span>}>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Figure label="Money counted" value={month.income} href="/money?type=money_in" />
          <Figure label="Bills" value={-month.bills} href="/money?type=bill" />
          <Figure label="Commission" value={-month.commissions} href="/money?type=commission" />
          <Figure label="Leftover" value={today.leftover} strong />
        </div>
        <div className="mt-6 border-t border-line pt-5">
          <p className="mb-3 text-sm text-muted">How the leftover would be divided today</p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
            {(Object.keys(today.split) as PotKey[]).map((k) => (
              <div key={k} className="flex justify-between gap-2">
                <span className="text-ink/70">
                  {POT_LABELS[k]} <span className="text-muted">{Math.round(money.split[k] * 100)}%</span>
                </span>
                <span className="tabular font-medium">{kes(today.split[k])}</span>
              </div>
            ))}
          </div>
        </div>
        {today.shortfall > 0 && (
          <p className="mt-4 rounded-2xl bg-warn-soft px-3 py-2.5 text-sm text-warn">
            Bills are {kes(today.shortfall)} more than the money counted. If it stays this way, nobody is paid this month and the gap comes from the reserve with both co-founders&apos; signatures.
          </p>
        )}
        <Link href="/statements" className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-lime-deep">
          See how statements are worked out <ArrowIcon className="h-4 w-4" />
        </Link>
      </Card>
    </div>
  );
}

function Part({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <div className="rounded-2xl bg-white/[0.06] px-4 py-3">
      <p className="text-xs text-white/55">{label}</p>
      <p className="tabular mt-0.5 text-lg font-semibold">{kes(value)}</p>
      <p className="mt-0.5 text-xs text-white/45">{note}</p>
    </div>
  );
}

function Figure({ label, value, href, strong }: { label: string; value: number; href?: string; strong?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-lg ${strong ? "font-semibold" : "font-medium"}`}>
        <Money amount={value} href={href} />
      </p>
    </div>
  );
}

function greeting() {
  const h = Number(new Date().toLocaleString("en-KE", { hour: "numeric", hour12: false, timeZone: "Africa/Nairobi" }));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/** Payment day is still to be decided; until then the 5th after the period ends. */
function nextPayout(periodEnd: string) {
  const [y, m] = periodEnd.split("-").map(Number);
  const next = m === 12 ? [y + 1, 1] : [y, m + 1];
  return `${next[0]}-${String(next[1]).padStart(2, "0")}-05`;
}
