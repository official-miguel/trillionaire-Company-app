// The month-end sums from "How the Web App Should Work", in the same order.
// Amounts are whole Kenya shillings. Rounding differences go to the reserve,
// so every shilling of the leftover lands in exactly one place.

export type PotKey = "pool" | "payout" | "fee" | "growth" | "product" | "reserve";

export const POT_LABELS: Record<PotKey, string> = {
  pool: "Team pool",
  payout: "Owners' payout",
  fee: "Trillionaire Designs fee",
  growth: "Bidii growth",
  product: "Bidii product",
  reserve: "Bidii reserve",
};

export interface MoneySettings {
  split: Record<PotKey, number>;
  /** Team pool weights by person id. They need not add to 100. */
  weights: Record<string, number>;
  /** Class A's share of Bidii (72) and issued share parts per person. */
  classAShareOfBidii: number;
  classAParts: Record<string, number>;
  classBParts: Record<string, number>;
  /** Pool pay cut by number of confirmed misses: index 1, 2, 3+. */
  missCuts: [number, number, number];
  /** Reserve target in months of running costs. */
  reserveTargetMonths: number;
}

export const DEFAULT_MONEY: MoneySettings = {
  split: { pool: 0.3, payout: 0.2, fee: 0.1, growth: 0.2, product: 0.1, reserve: 0.1 },
  weights: { miguel: 40, romeo: 22, samuel: 15, ruth: 15, larmeck: 15 },
  classAShareOfBidii: 72,
  classAParts: { miguel: 75, romeo: 15 },
  classBParts: { samuel: 7, ruth: 6, larmeck: 5 },
  missCuts: [0.25, 0.5, 1],
  reserveTargetMonths: 6,
};

export interface MonthInput {
  /** Cash counted for the month, including released advance fees. */
  income: number;
  bills: number;
  commissions: number;
  /** Confirmed misses per person id. */
  misses?: Record<string, number>;
  /** Reserve balance before this month, and Bidii's monthly running costs. */
  reserveBalance?: number;
  monthlyRunningCosts?: number;
}

export interface PersonResult {
  poolPay: number;
  poolCut: number;
  payout: number;
}

export interface MonthResult {
  leftover: number;
  shortfall: number;
  /** The leftover split by the Settings percentages, before anything moves. */
  split: Record<PotKey, number>;
  /** Where the money ends up: pool and payout hold what people are paid. */
  pots: Record<PotKey, number>;
  people: Record<string, PersonResult>;
  /** Money withheld from pool pay by task misses (already inside pots.reserve). */
  withheld: number;
  /** Reserve money moved to growth and product because the reserve is full. */
  reserveOverflow: number;
}

const POTS: PotKey[] = ["pool", "payout", "fee", "growth", "product", "reserve"];

export function closeMonth(input: MonthInput, s: MoneySettings = DEFAULT_MONEY): MonthResult {
  const raw = input.income - input.bills - input.commissions;
  const leftover = Math.max(0, raw);
  const shortfall = Math.max(0, -raw);

  const pots = Object.fromEntries(POTS.map((k) => [k, Math.round(leftover * s.split[k])])) as Record<PotKey, number>;
  pots.reserve += leftover - POTS.reduce((sum, k) => sum + pots[k], 0);
  const split = { ...pots };

  const people: Record<string, PersonResult> = {};
  const ids = new Set([...Object.keys(s.weights), ...Object.keys(s.classAParts), ...Object.keys(s.classBParts)]);
  for (const id of ids) people[id] = { poolPay: 0, poolCut: 0, payout: 0 };

  // Team pool by weight, then task cuts. Withheld pay goes to the reserve.
  const totalWeight = Object.values(s.weights).reduce((a, b) => a + b, 0);
  let poolPaid = 0;
  let withheld = 0;
  for (const [id, w] of Object.entries(s.weights)) {
    const full = Math.round((pots.pool * w) / totalWeight);
    const misses = input.misses?.[id] ?? 0;
    const cut = misses === 0 ? 0 : s.missCuts[Math.min(misses, 3) - 1];
    const paid = Math.round(full * (1 - cut));
    people[id].poolPay = paid;
    people[id].poolCut = full - paid;
    withheld += full - paid;
    poolPaid += paid;
  }
  // Withheld pay and rounding move from the pool to the reserve.
  pots.reserve += pots.pool - poolPaid;
  pots.pool = poolPaid;

  // Owners' payout on issued shares only: Class A's 72 against Class B's issued parts.
  const bIssued = Object.values(s.classBParts).reduce((a, b) => a + b, 0);
  const aTotal = Math.round((pots.payout * s.classAShareOfBidii) / (s.classAShareOfBidii + bIssued));
  const bTotal = pots.payout - aTotal;
  let payoutPaid = 0;
  for (const [parts, total] of [
    [s.classAParts, aTotal],
    [s.classBParts, bTotal],
  ] as const) {
    const sum = Object.values(parts).reduce((a, b) => a + b, 0);
    for (const [id, p] of Object.entries(parts)) {
      const amount = Math.round((total * p) / sum);
      people[id].payout = amount;
      payoutPaid += amount;
    }
  }
  pots.reserve += pots.payout - payoutPaid; // rounding
  pots.payout = payoutPaid;

  // Reserve limit: once about six months of running costs are saved, new
  // reserve money goes to the joint fund in the growth:product ratio.
  let reserveOverflow = 0;
  if (input.monthlyRunningCosts && input.reserveBalance !== undefined) {
    const room = Math.max(0, input.monthlyRunningCosts * s.reserveTargetMonths - input.reserveBalance);
    reserveOverflow = Math.max(0, pots.reserve - room);
    if (reserveOverflow > 0) {
      const toGrowth = Math.round((reserveOverflow * s.split.growth) / (s.split.growth + s.split.product));
      pots.growth += toGrowth;
      pots.product += reserveOverflow - toGrowth;
      pots.reserve -= reserveOverflow;
    }
  }

  return { leftover, shortfall, split, pots, people, withheld, reserveOverflow };
}

/** What a person would be paid if the month closed today. */
export function earnToday(personId: string, monthToDate: MonthInput, s: MoneySettings = DEFAULT_MONEY) {
  const r = closeMonth(monthToDate, s);
  const p = r.people[personId] ?? { poolPay: 0, poolCut: 0, payout: 0 };
  return { total: p.poolPay + p.payout, poolPay: p.poolPay, payout: p.payout, leftover: r.leftover };
}

/** Advance fees are held and released in equal monthly parts. */
export function releaseSchedule(amount: number, months: number): number[] {
  const base = Math.floor(amount / months);
  const out = Array.from({ length: months }, () => base);
  out[months - 1] += amount - base * months;
  return out;
}
