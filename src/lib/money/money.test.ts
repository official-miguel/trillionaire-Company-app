import { describe, expect, it } from "vitest";
import { invoiceTotal, onboardingFee, subscriptionInvoice, termlyTotal } from "./pricing";
import { closeMonth, earnToday, releaseSchedule } from "./monthEnd";
import { commissionOn } from "./commission";

describe("pricing guide", () => {
  it.each([
    [20, 3000],
    [300, 45000],
    [305, 45600],
    [500, 69000],
    [800, 105000],
    [1000, 125000],
    [1500, 175000],
  ])("%i students cost KES %i a term", (students, total) => {
    expect(termlyTotal(students)).toBe(total);
  });

  it("caps low-fee schools at KES 100 a student", () => {
    expect(termlyTotal(500, true)).toBe(50000);
  });

  it("charges each package the same over a year, less 10% for yearly", () => {
    const school = { students: 500 };
    expect(invoiceTotal(subscriptionInvoice({ ...school, package: "termly" }))).toBe(69000);
    expect(invoiceTotal(subscriptionInvoice({ ...school, package: "monthly" }))).toBe(23000);
    expect(invoiceTotal(subscriptionInvoice({ ...school, package: "yearly" }))).toBe(186300);
  });

  it("gives a group school only the group discount", () => {
    const lines = subscriptionInvoice({ students: 500, package: "yearly", groupCampuses: 3 });
    expect(lines.map((l) => l.label)).toEqual(["500 students, 3 terms", "School group discount (10%)"]);
    expect(invoiceTotal(lines)).toBe(186300);
  });

  it("sets onboarding by size, free for the Founding 10", () => {
    expect(onboardingFee({ students: 300, package: "termly" })).toBe(5000);
    expect(onboardingFee({ students: 301, package: "termly" })).toBe(7500);
    expect(onboardingFee({ students: 801, package: "termly" })).toBe(9000);
    expect(onboardingFee({ students: 801, package: "termly", founding10: true })).toBe(0);
  });
});

describe("month-end", () => {
  it("splits the KES 300,000 example into the document's pots", () => {
    const r = closeMonth({ income: 300000, bills: 55170, commissions: 0 });
    expect(r.leftover).toBe(244830);
    expect(r.split).toEqual({ pool: 73449, payout: 48966, fee: 24483, growth: 48966, product: 24483, reserve: 24483 });
  });

  it("keeps every shilling of the leftover in a pot after people are paid", () => {
    for (const income of [300000, 122415, 98765]) {
      const r = closeMonth({ income, bills: 0, commissions: 0, misses: { ruth: 1, samuel: 3 } });
      expect(Object.values(r.pots).reduce((a, b) => a + b, 0)).toBe(income);
      const paid = Object.values(r.people).reduce((a, p) => a + p.poolPay + p.payout, 0);
      expect(paid).toBe(r.pots.pool + r.pots.payout);
    }
  });

  it("cuts Ruth's pool pay by half for two misses, withheld money to the reserve", () => {
    const clean = closeMonth({ income: 300000, bills: 55170, commissions: 0 });
    expect(clean.people.ruth.poolPay).toBe(10297);
    const r = closeMonth({ income: 300000, bills: 55170, commissions: 0, misses: { ruth: 2 } });
    expect(r.people.ruth.poolPay).toBe(5149);
    expect(r.people.ruth.poolCut).toBe(5148);
    expect(r.withheld).toBe(5148);
    expect(r.pots.reserve - clean.pots.reserve).toBe(5148);
  });

  it("pays owners on issued shares: 80/20, then by parts", () => {
    const r = closeMonth({ income: 300000, bills: 55170, commissions: 0 });
    const p = r.people;
    expect(p.miguel.payout + p.romeo.payout).toBe(39173);
    expect(p.miguel.payout).toBe(32644);
    expect(p.romeo.payout).toBe(6529);
    // Class B's 9,793 split 7:6:5; the odd shilling of rounding goes to the reserve.
    expect([p.samuel.payout, p.ruth.payout, p.larmeck.payout]).toEqual([3808, 3264, 2720]);
  });

  it("estimates Samuel's pay on the 15th", () => {
    // The design doc shows 5,149 + 1,904 = 7,053; exact rounding gives 5,148.
    const e = earnToday("samuel", { income: 150000, bills: 27585, commissions: 0 });
    expect(e.leftover).toBe(122415);
    expect(e.payout).toBe(1904);
    expect(e.poolPay).toBe(5148);
  });

  it("pays nothing when bills exceed the money", () => {
    const r = closeMonth({ income: 40000, bills: 55170, commissions: 0 });
    expect(r.leftover).toBe(0);
    expect(r.shortfall).toBe(15170);
    expect(r.people.miguel.poolPay).toBe(0);
  });

  it("sends new reserve money to the joint fund once the reserve is full", () => {
    const open = closeMonth({ income: 300000, bills: 55170, commissions: 0 });
    // Target is 6 × 55,170 = 331,020, so only 1,020 more fits.
    const r = closeMonth({ income: 300000, bills: 55170, commissions: 0, reserveBalance: 330000, monthlyRunningCosts: 55170 });
    expect(r.pots.reserve).toBe(1020);
    expect(r.reserveOverflow).toBe(open.pots.reserve - 1020);
    expect(r.pots.growth + r.pots.product).toBe(open.pots.growth + open.pots.product + r.reserveOverflow);
  });

  it("releases advance fees in equal monthly parts", () => {
    expect(releaseSchedule(186300, 12)).toEqual([...Array(11).fill(15525), 15525]);
    expect(releaseSchedule(100, 3)).toEqual([33, 33, 34]);
  });
});

describe("commission", () => {
  const payments = [
    { date: "2026-01-10", amount: 69000, kind: "subscription" as const },
    { date: "2026-01-10", amount: 7500, kind: "onboarding" as const },
    { date: "2027-01-12", amount: 69000, kind: "subscription" as const },
  ];
  it("pays 3% to the team and 5% to outsiders, first-year subscription only", () => {
    expect(commissionOn(payments, "2026-01-05", "team")).toBe(2070);
    expect(commissionOn(payments, "2026-01-05", "outside")).toBe(3450);
  });
});
