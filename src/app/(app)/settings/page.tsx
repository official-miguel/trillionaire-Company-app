import { Badge, Card, PageHeader } from "@/components/ui";
import { can, getRecentChanges, getSettings, getViewer } from "@/lib/data/queries";
import { POT_LABELS, type PotKey } from "@/lib/money/monthEnd";
import { kes, shortDate } from "@/lib/format";
import { saveSettings } from "./actions";
import { SubmitButton } from "@/components/SubmitButton";

export const metadata = { title: "Settings" };

const pct = (n: number) => `${Math.round(n * 1000) / 10}%`;
const pctValue = (n: number) => Math.round(n * 1000) / 10;

const MESSAGES: Record<string, [string, "ok" | "warn"]> = {
  "saved=demo": ["Demo mode: nothing was saved.", "ok"],
  "saved=none": ["Nothing changed, so nothing was saved.", "ok"],
  "error=reason": ["Write a reason for the change. Everyone is told what changed and why.", "warn"],
  "error=split": ["The split of the leftover must add up to exactly 100%.", "warn"],
  "error=tiers": ["Each student tier must end after the one before it.", "warn"],
  "error=number": ["Every box needs a number of 0 or more.", "warn"],
  "error=not-allowed": ["Only the owner, or someone the owner allows, can change Settings.", "warn"],
};

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const [viewer, { money, pricing, commission, rows }, changes, params] = await Promise.all([getViewer(), getSettings(), getRecentChanges(), searchParams]);
  const classA = viewer.role === "td_cofounder" || viewer.isOwner;
  const canEdit = can(viewer, "bidii", "settings_editor");
  const raw = (key: string) => (rows.find((r) => r.ledgerId === "bidii" && r.key === key)?.value ?? {}) as Record<string, number>;
  const feeRate = raw("fee").rate ?? money.split.fee;
  const requestLimit = raw("requests").singleApproverLimit ?? 20000;
  const minimumPayout = raw("payout").minimumPool ?? 5000;

  const [key, value] = Object.entries(params)[0] ?? [];
  const message = key === "saved" && /^\d+$/.test(value)
    ? ([`Saved. ${value} setting${value === "1" ? "" : "s"} changed, and everyone has been told.`, "ok"] as const)
    : (MESSAGES[`${key}=${value}`] ?? (key === "error" && value ? ([value, "warn"] as const) : null));

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle={
          canEdit
            ? "Every price and percentage the app uses. A change takes effect at once, keeps the old value, and everyone is told what changed and why."
            : "Every price and percentage the app uses. Only the owner, or someone the owner allows, can change them; you'll be told when they do."
        }
      />
      {message && <p className={`mb-5 rounded-2xl px-4 py-3 text-sm ${message[1] === "ok" ? "bg-lime-soft" : "bg-warn-soft text-warn"}`}>{message[0]}</p>}

      <div className="flex flex-col gap-5">
        {changes.length > 0 && (
          <Card title="Recent changes">
            <ul className="divide-y divide-line">
              {changes.map((c) => (
                <li key={c.at + c.label} className="py-2.5 text-sm">
                  <span className="font-medium">{c.who.split(" ")[0]}</span> changed {c.label} <span className="text-muted">· {shortDate(c.at)}</span>
                  <p className="text-muted">{c.reason}</p>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {canEdit ? (
          <>
            <Card title="Money rules" action={<Badge>From the shareholders&apos; agreements</Badge>}>
              <form action={saveSettings} id="money" className="flex flex-col gap-6">
                <input type="hidden" name="section" value="money" />
                <Group title="Split of the leftover" hint="Must add up to 100%.">
                  {(Object.keys(money.split) as PotKey[]).map((k) => (
                    <NumberField key={k} name={k} label={POT_LABELS[k]} value={pctValue(money.split[k])} suffix="%" step="0.1" />
                  ))}
                </Group>
                <Group title="Team pool weights" hint="Shares of the team pool; they don't need to add up to 100.">
                  {Object.entries(money.weights).map(([slug, w]) => (
                    <NumberField key={slug} name={`w_${slug}`} label={cap(slug)} value={w} />
                  ))}
                </Group>
                <Group title="Commission" hint="Of what a school pays for its subscription in its first year.">
                  <NumberField name="c_team" label="Team member" value={pctValue(commission.team)} suffix="%" step="0.1" />
                  <NumberField name="c_outside" label="Outside referrer" value={pctValue(commission.outside)} suffix="%" step="0.1" />
                </Group>
                <Group title="Task pay cuts" hint="How much of a person's pool pay is held back for missed tasks.">
                  <NumberField name="cut1" label="One miss" value={pctValue(money.missCuts[0])} suffix="%" />
                  <NumberField name="cut2" label="Two misses" value={pctValue(money.missCuts[1])} suffix="%" />
                  <NumberField name="cut3" label="Three or more" value={pctValue(money.missCuts[2])} suffix="%" />
                </Group>
                <Group title="Limits">
                  <NumberField name="request_limit" label="One approver up to (KES)" value={requestLimit} step="1000" />
                  <NumberField name="minimum_payout" label="Minimum team pool payout (KES)" value={minimumPayout} step="500" />
                  <NumberField name="reserve_months" label="Reserve target (months of costs)" value={money.reserveTargetMonths} />
                </Group>
                <p className="text-xs text-muted">The Trillionaire Designs fee is the &ldquo;{POT_LABELS.fee}&rdquo; share of the split above ({pct(feeRate)} now).</p>
                <Reason />
              </form>
            </Card>

            <Card title="School prices" action={<Badge>From the Bidii Pricing Guide</Badge>}>
              <form action={saveSettings} id="prices" className="flex flex-col gap-6">
                <input type="hidden" name="section" value="prices" />
                <Group title="Price per student per term" hint="Each tier is charged only on the students inside it.">
                  <NumberField name="t1_upto" label="First tier: students 1 to" value={pricing.tiers[0].upTo ?? 300} />
                  <NumberField name="t1_rate" label="First tier price (KES)" value={pricing.tiers[0].rate} />
                  <NumberField name="t2_upto" label="Second tier: up to student" value={pricing.tiers[1].upTo ?? 800} />
                  <NumberField name="t2_rate" label="Second tier price (KES)" value={pricing.tiers[1].rate} />
                  <NumberField name="t3_rate" label="Above that (KES)" value={pricing.tiers[2].rate} />
                  <NumberField name="low_fee_cap" label="Low-fee school cap (KES)" value={pricing.lowFeeCapRate} />
                </Group>
                <Group title="Onboarding fee (one time)" hint="By school size. The Founding 10 never pay it.">
                  <NumberField name="on_small" label="Small (KES)" value={pricing.onboarding.small} step="500" />
                  <NumberField name="on_medium" label="Medium (KES)" value={pricing.onboarding.medium} step="500" />
                  <NumberField name="on_large" label="Large (KES)" value={pricing.onboarding.large} step="500" />
                </Group>
                <Group title="Discounts" hint="A school gets only one: a group school gets only the group discount.">
                  <NumberField name="yearly_discount" label="Paying for the year" value={pctValue(pricing.yearlyDiscount)} suffix="%" />
                  <NumberField name="group_discount" label={`Group of ${pricing.groupMinCampuses}+ campuses`} value={pctValue(pricing.groupDiscount)} suffix="%" />
                </Group>
                <Reason />
              </form>
            </Card>
          </>
        ) : (
          <>
            <Card title="Money rules" action={<Badge>From the shareholders&apos; agreements</Badge>}>
              <Rows
                rows={[
                  ["Split of the leftover", (Object.keys(money.split) as PotKey[]).filter((k) => classA || k !== "fee").map((k) => `${POT_LABELS[k]} ${pct(money.split[k])}`).join(" · ")],
                  ["Team pool weights", Object.entries(money.weights).map(([k, v]) => `${cap(k)} ${v}`).join(" · ")],
                  ["Commission", `Team ${pct(commission.team)} · outside referrers ${pct(commission.outside)}, of a school's first-year subscription payments`],
                  ["Task pay cuts", `One miss ${pct(money.missCuts[0])} · two ${pct(money.missCuts[1])} · three or more ${pct(money.missCuts[2])}`],
                  ["Reserve target", `About ${money.reserveTargetMonths} months of Bidii's running costs`],
                  ["Request limit", `${kes(requestLimit)} for one approver; above it, two`],
                ]}
              />
            </Card>
            <Card title="School prices" action={<Badge>From the Bidii Pricing Guide</Badge>}>
              <Rows
                rows={[
                  ["Volume tiers", pricing.tiers.map((t, i) => `${i === 0 ? 1 : (pricing.tiers[i - 1].upTo ?? 0) + 1}${t.upTo ? `–${t.upTo}` : "+"}: ${kes(t.rate)}`).join(" · ")],
                  ["Low-fee school cap", `At most ${kes(pricing.lowFeeCapRate)} per student per term`],
                  ["Onboarding fee", `${kes(pricing.onboarding.small)} · ${kes(pricing.onboarding.medium)} · ${kes(pricing.onboarding.large)} by size. Free for the Founding 10`],
                  ["Discounts", `Yearly ${pct(pricing.yearlyDiscount)} · group of ${pricing.groupMinCampuses}+ ${pct(pricing.groupDiscount)}. Only one per school`],
                ]}
              />
            </Card>
          </>
        )}
      </div>
    </>
  );
}

function Group({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className="font-medium">{title}</legend>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">{children}</div>
    </fieldset>
  );
}

function NumberField({ name, label, value, suffix, step = "1" }: { name: string; label: string; value: number; suffix?: string; step?: string }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-ink/70">{label}</span>
      <span className="flex items-center rounded-full border border-line bg-white px-4 focus-within:border-lime">
        <input name={name} type="number" min="0" step={step} defaultValue={value} required inputMode="decimal" className="tabular w-full bg-transparent py-2.5 text-base outline-none" />
        {suffix && <span className="text-muted">{suffix}</span>}
      </span>
    </label>
  );
}

function Reason() {
  return (
    <div className="flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:items-end">
      <label className="flex flex-1 flex-col gap-1 text-sm">
        <span className="font-medium">Reason for the change</span>
        <input name="reason" required placeholder="Everyone is told what changed and why" className="rounded-full border border-line bg-white px-4 py-2.5 text-base outline-none focus:border-lime" />
      </label>
      <SubmitButton pending="Saving…" className="rounded-full bg-lime px-6 py-2.5 text-sm font-semibold text-ink hover:brightness-95">Save changes</SubmitButton>
    </div>
  );
}

function Rows({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="divide-y divide-line">
      {rows.map(([label, value]) => (
        <div key={label} className="grid grid-cols-1 gap-1 py-3 sm:grid-cols-[14rem_1fr] sm:gap-4">
          <dt className="font-medium">{label}</dt>
          <dd className="text-ink/80">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
