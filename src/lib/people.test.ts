import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { ledgersForRole, slugFor, toE164Kenya, validateNewPerson } = await import("./people");

const base = {
  name: "Samuel Kuhia",
  email: "samuel@example.com",
  phone: "0712345678",
  role: "product_cofounder" as const,
  shareClass: "B" as const,
  temporaryPassword: "bidii-2026",
  permissions: [],
};

describe("adding people", () => {
  it("accepts a valid Bidii co-founder", () => {
    expect(validateNewPerson(base)).toBeNull();
  });

  it("rejects short temporary passwords and a wrong share class", () => {
    expect(validateNewPerson({ ...base, temporaryPassword: "short" })).toMatch(/at least 8/);
    expect(validateNewPerson({ ...base, shareClass: "A" })).toMatch(/Class B/);
  });

  it("shows Bidii co-founders only the Bidii ledger", () => {
    expect(ledgersForRole("product_cofounder", ["company", "bidii"])).toEqual(["bidii"]);
    expect(ledgersForRole("td_cofounder", ["company", "bidii"])).toEqual(["company", "bidii"]);
  });

  it("stores Kenyan phone numbers in +254 form", () => {
    expect(toE164Kenya("0712 345 678")).toBe("+254712345678");
    expect(toE164Kenya("254112345678")).toBe("+254112345678");
    expect(toE164Kenya("+1 202 555 0100")).toBe("+1 202 555 0100");
  });

  it("makes a unique slug from the first name", () => {
    expect(slugFor("Ruth Lewis", [])).toBe("ruth");
    expect(slugFor("Ruth Wambui", ["ruth"])).toBe("ruth2");
  });
});
