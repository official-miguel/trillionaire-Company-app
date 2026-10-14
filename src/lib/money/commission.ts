// Commission is a percentage of what a school actually pays for its
// subscription in its first year, paid as the money arrives. The onboarding
// fee and extra messaging never count.

export type FinderKind = "team" | "outside";

export const DEFAULT_COMMISSION: Record<FinderKind, number> = { team: 0.03, outside: 0.05 };

export interface SchoolPayment {
  date: string; // ISO date
  amount: number;
  kind: "subscription" | "onboarding" | "messaging" | "licence";
}

/** True if `date` falls within one year of the school signing. */
export function inFirstYear(signedOn: string, date: string): boolean {
  const start = new Date(signedOn);
  const end = new Date(start);
  end.setFullYear(end.getFullYear() + 1);
  const d = new Date(date);
  return d >= start && d < end;
}

/** Commission owed on the given payments, e.g. one month's receipts. */
export function commissionOn(
  payments: SchoolPayment[],
  signedOn: string,
  finder: FinderKind,
  rates: Record<FinderKind, number> = DEFAULT_COMMISSION,
): number {
  const base = payments
    .filter((p) => p.kind === "subscription" && inFirstYear(signedOn, p.date))
    .reduce((sum, p) => sum + p.amount, 0);
  return Math.round(base * rates[finder]);
}
