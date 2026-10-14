import { describe, expect, it } from "vitest";
import { approvalNeed, type Approver } from "./approvals";

const people: Approver[] = [
  { slug: "miguel", name: "Miguel Muiruri", approverLimit: 20000, secondSigner: true },
  { slug: "romeo", name: "Romeo Mbote", approverLimit: 20000, secondSigner: true },
  { slug: "samuel", name: "Samuel Kuhia", approverLimit: null, secondSigner: false },
];

describe("request approvals", () => {
  it("lets either co-founder approve a small request from the team", () => {
    const n = approvalNeed({ requesterSlug: "samuel", amount: 8500, potKey: "growth", approvedBy: [] }, people);
    expect(n.needed).toBe(1);
    expect(n.eligible.map((a) => a.slug)).toEqual(["miguel", "romeo"]);
  });

  it("never lets someone approve their own request", () => {
    const n = approvalNeed({ requesterSlug: "romeo", amount: 5000, potKey: "growth", approvedBy: ["romeo"] }, people);
    expect(n.eligible.map((a) => a.slug)).toEqual(["miguel"]);
    expect(n.done).toBe(false);
    expect(n.summary).toBe("This sends your request to Miguel.");
  });

  it("needs two signers above KES 20,000", () => {
    const n = approvalNeed({ requesterSlug: "samuel", amount: 26000, potKey: "product", approvedBy: ["romeo"] }, people);
    expect(n.needed).toBe(2);
    expect(n.done).toBe(false);
    expect(approvalNeed({ requesterSlug: "samuel", amount: 26000, potKey: "product", approvedBy: ["romeo", "miguel"] }, people).done).toBe(true);
  });

  it("flags a request above the limit from a co-founder as unapprovable without a second signer", () => {
    const n = approvalNeed({ requesterSlug: "miguel", amount: 26000, potKey: "product", approvedBy: [] }, people);
    expect(n.eligible.map((a) => a.slug)).toEqual(["romeo"]);
    expect(n.summary).toMatch(/Nobody can approve/);
  });

  it("needs both signers for the reserve and tells Class B", () => {
    const n = approvalNeed({ requesterSlug: "samuel", amount: 1000, potKey: "reserve", approvedBy: [] }, people);
    expect(n.needed).toBe(2);
    expect(n.tellClassB).toBe(true);
  });
});
