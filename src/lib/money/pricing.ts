// School pricing from the Bidii Pricing Guide. All values come from Settings;
// the defaults here match the guide so tests and first run have real numbers.

export type Package = "monthly" | "termly" | "yearly";

export interface Tier {
  /** Last student number in this tier, or null for "and above". */
  upTo: number | null;
  rate: number;
}

export interface PricingSettings {
  tiers: Tier[];
  lowFeeCapRate: number;
  onboarding: { small: number; medium: number; large: number };
  /** Student counts where medium and large onboarding start. */
  onboardingBands: { mediumFrom: number; largeFrom: number };
  yearlyDiscount: number;
  groupDiscount: number;
  groupMinCampuses: number;
  termsPerYear: number;
}

export const DEFAULT_PRICING: PricingSettings = {
  tiers: [
    { upTo: 300, rate: 150 },
    { upTo: 800, rate: 120 },
    { upTo: null, rate: 100 },
  ],
  lowFeeCapRate: 100,
  onboarding: { small: 5000, medium: 7500, large: 9000 },
  onboardingBands: { mediumFrom: 301, largeFrom: 801 },
  yearlyDiscount: 0.1,
  groupDiscount: 0.1,
  groupMinCampuses: 3,
  termsPerYear: 3,
};

export interface SchoolPricingInput {
  students: number;
  package: Package;
  lowFee?: boolean;
  founding10?: boolean;
  /** Number of campuses in the school's group, if it belongs to one. */
  groupCampuses?: number;
}

/** Termly total before discounts, billed tier by tier like a tax bracket. */
export function termlyTotal(students: number, lowFee = false, s: PricingSettings = DEFAULT_PRICING): number {
  let total = 0;
  let from = 0;
  for (const tier of s.tiers) {
    const to = tier.upTo ?? Infinity;
    const inTier = Math.max(0, Math.min(students, to) - from);
    const rate = lowFee ? Math.min(tier.rate, s.lowFeeCapRate) : tier.rate;
    total += inTier * rate;
    from = to;
    if (students <= to) break;
  }
  return total;
}

export function onboardingFee(input: SchoolPricingInput, s: PricingSettings = DEFAULT_PRICING): number {
  if (input.founding10) return 0;
  if (input.students >= s.onboardingBands.largeFrom) return s.onboarding.large;
  if (input.students >= s.onboardingBands.mediumFrom) return s.onboarding.medium;
  return s.onboarding.small;
}

export interface InvoiceLine {
  label: string;
  amount: number;
}

/**
 * The lines of one subscription invoice. Discounts never stack: a school in a
 * qualifying group gets only the group discount, even on the yearly package.
 * `monthsInTerm` is needed for monthly billing (usually 3).
 */
export function subscriptionInvoice(
  input: SchoolPricingInput,
  opts: { monthsInTerm?: number } = {},
  s: PricingSettings = DEFAULT_PRICING,
): InvoiceLine[] {
  const term = termlyTotal(input.students, input.lowFee, s);
  const lines: InvoiceLine[] = [];
  let base: number;
  if (input.package === "termly") {
    base = term;
    lines.push({ label: `${input.students} students, one term`, amount: base });
  } else if (input.package === "yearly") {
    base = term * s.termsPerYear;
    lines.push({ label: `${input.students} students, ${s.termsPerYear} terms`, amount: base });
  } else {
    const months = opts.monthsInTerm ?? 3;
    base = Math.round(term / months);
    lines.push({ label: `${input.students} students, one school month (1/${months} of the term)`, amount: base });
  }

  const inGroup = (input.groupCampuses ?? 0) >= s.groupMinCampuses;
  if (inGroup) {
    lines.push({ label: `School group discount (${pct(s.groupDiscount)})`, amount: -Math.round(base * s.groupDiscount) });
  } else if (input.package === "yearly") {
    lines.push({ label: `Yearly payment discount (${pct(s.yearlyDiscount)})`, amount: -Math.round(base * s.yearlyDiscount) });
  }
  return lines;
}

export function invoiceTotal(lines: InvoiceLine[]): number {
  return lines.reduce((sum, l) => sum + l.amount, 0);
}

function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}
