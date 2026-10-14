import { Badge, Card, PageHeader } from "@/components/ui";
import { getSettings, getViewer } from "@/lib/data/queries";
import { POT_LABELS, type PotKey } from "@/lib/money/monthEnd";
import { kes } from "@/lib/format";

export const metadata = { title: "Settings" };

const RULES = {
  all_shareholders: "Every shareholder, both classes",
  both_classes: "Class A and Class B",
  both_cofounders: "Miguel and Romeo",
  holder: "The holder",
};

const pct = (n: number) => `${Math.round(n * 1000) / 10}%`;

export default async function SettingsPage() {
  const [viewer, { money, pricing, commission }] = await Promise.all([getViewer(), getSettings()]);
  const classA = viewer.role === "td_cofounder";

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Every price and percentage the app uses. A change keeps the old value, who approved it, when and why, and starts from the next period."
      />
      <div className="flex flex-col gap-5">
        <Card title="School prices" action={<Badge>From the Bidii Pricing Guide</Badge>}>
          <Rows
            rows={[
              ["Standard price", `${kes(pricing.tiers[0].rate)} per student per term, every module included`, RULES.both_cofounders],
              ["Volume tiers", pricing.tiers.map((t, i) => `${i === 0 ? 1 : (pricing.tiers[i - 1].upTo ?? 0) + 1}${t.upTo ? `–${t.upTo}` : "+"}: ${kes(t.rate)}`).join(" · "), RULES.both_cofounders],
              ["Low-fee school cap", `At most ${kes(pricing.lowFeeCapRate)} per student per term`, RULES.both_cofounders],
              ["Onboarding fee", `${kes(pricing.onboarding.small)} · ${kes(pricing.onboarding.medium)} · ${kes(pricing.onboarding.large)} by size. Free for the Founding 10`, RULES.both_cofounders],
              ["Yearly payment discount", `${pct(pricing.yearlyDiscount)} off the school year`, RULES.both_cofounders],
              ["School group discount", `${pct(pricing.groupDiscount)} for ${pricing.groupMinCampuses}+ campuses. A group school gets only this discount`, RULES.both_cofounders],
              ["Monthly billing", "Each term's total split over the months the school is open; nothing in the holidays", RULES.both_cofounders],
              ["Special prices", "Anything outside the guide needs Larmeck's approval", "Larmeck"],
            ]}
          />
        </Card>

        <Card title="Money rules" action={<Badge>From the shareholders&apos; agreements</Badge>}>
          <Rows
            rows={[
              ["Split of the leftover", (Object.keys(money.split) as PotKey[]).map((k) => `${POT_LABELS[k]} ${pct(money.split[k])}`).join(" · "), RULES.all_shareholders],
              ["Team pool weights", Object.entries(money.weights).map(([k, v]) => `${cap(k)} ${v}`).join(" · "), RULES.all_shareholders],
              ["Owners' payout", `Class A's ${money.classAShareOfBidii} against Class B's issued parts; reserved pools receive nothing`, "Follows the share register"],
              ["Class A issued parts", Object.entries(money.classAParts).map(([k, v]) => `${cap(k)} ${v}`).join(" · "), "All Class A shareholders"],
              ["Class B issued parts", Object.entries(money.classBParts).map(([k, v]) => `${cap(k)} ${v}`).join(" · "), RULES.all_shareholders],
              ["Commission, team member", `${pct(commission.team)} of what a school pays for its subscription in its first year`, RULES.all_shareholders],
              ["Commission, outside referrer", `${pct(commission.outside)} of what a school pays for its subscription in its first year`, RULES.all_shareholders],
              ["Task pay cuts", `One miss ${pct(money.missCuts[0])} · two ${pct(money.missCuts[1])} · three or more ${pct(money.missCuts[2])}`, RULES.all_shareholders],
              ["Reserve target", `About ${money.reserveTargetMonths} months of Bidii's running costs`, RULES.all_shareholders],
              ["Request limit", "KES 20,000 for one approver; above it, two", RULES.both_cofounders],
              ...(classA ? ([["Trillionaire Designs fee", "10% of the leftover, reviewed every 12 months", RULES.both_classes]] as [string, string, string][]) : []),
            ]}
          />
        </Card>

        <p className="text-sm text-muted">
          Proposing a change sends it to everyone who must approve it. It takes effect only when the last one approves. {classA ? "" : "Trillionaire Designs' own settings are shown only to Class A."}
        </p>
      </div>
    </>
  );
}

function Rows({ rows }: { rows: [string, string, string][] }) {
  return (
    <dl className="divide-y divide-line">
      {rows.map(([label, value, rule]) => (
        <div key={label} className="grid grid-cols-1 gap-1 py-3 sm:grid-cols-[14rem_1fr_auto] sm:gap-4">
          <dt className="font-medium">{label}</dt>
          <dd className="text-ink/80">{value}</dd>
          <dd className="text-xs text-muted sm:text-right">Change needs: {rule}</dd>
        </div>
      ))}
    </dl>
  );
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
