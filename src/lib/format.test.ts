import { describe, expect, it } from "vitest";
import { kes, monthBounds, monthLabel, shortDate } from "./format";

describe("dates and money on screen", () => {
  it("gives whole months, including the 31st and leap years", () => {
    expect(monthBounds("2026-10-14")).toEqual({ start: "2026-10-01", end: "2026-10-31" });
    expect(monthBounds("2028-02-03")).toEqual({ start: "2028-02-01", end: "2028-02-29" });
  });

  it("names the month correctly whatever the server's time zone", () => {
    expect(monthLabel("2026-10-01")).toBe("October 2026");
  });

  it("shows 1am Nairobi time as that day, not the day before", () => {
    // 22:30 UTC on 13 October is 01:30 on 14 October in Nairobi.
    expect(shortDate("2026-10-13T22:30:00+00:00")).toBe("14 Oct");
    expect(shortDate("2026-10-13")).toBe("13 Oct");
  });

  it("writes shillings with separators and a real minus sign", () => {
    expect(kes(150000)).toBe("KES 150,000");
    expect(kes(-27585)).toBe("−KES 27,585");
  });
});
