import { describe, expect, it } from "vitest";
import { cleanTopic, doneSummary, fieldTotals, ledgerSummary, templateFields, toCsv, type Topic } from "./types";

function fromTemplate(id: string): Topic {
  const { fields, icon } = templateFields(id);
  return { id: "t", name: "Test", icon, color: "#7cc242", fields, items: [], position: 0 };
}
const by = (t: Topic, label: string) => t.fields.find((f) => f.label === label)!.id;

describe("custom topics", () => {
  it("the money tracker template gives money in, out and a balance", () => {
    const t = fromTemplate("money");
    const [type, amount] = [by(t, "Type"), by(t, "Amount")];
    t.items = [
      { id: "1", values: { [type]: "In", [amount]: 5000 } },
      { id: "2", values: { [type]: "Out", [amount]: 1200.5 } },
      { id: "3", values: { [type]: "Out", [amount]: 300 } },
      { id: "4", values: { [amount]: 999 } }, // no type: not counted
    ];
    expect(ledgerSummary(t)).toMatchObject({ moneyIn: 5000, moneyOut: 1500.5, balance: 3499.5 });
    expect(fieldTotals(t)[0].total).toBe(7499.5);
  });

  it("a topic without an In/Out choice is not a ledger", () => {
    expect(ledgerSummary(fromTemplate("ideas"))).toBeNull();
  });

  it("counts ticked to-dos", () => {
    const t = fromTemplate("todo");
    const d = by(t, "Done");
    t.items = [{ id: "1", values: { [d]: true } }, { id: "2", values: {} }];
    expect(doneSummary(t)).toMatchObject({ done: 1, total: 2 });
  });

  it("exports a CSV with quoting", () => {
    const t = fromTemplate("contacts");
    t.items = [{ id: "1", values: { [by(t, "Name")]: 'Mary "MJ", Kamau', [by(t, "Notes")]: "line1\nline2" } }];
    expect(toCsv(t)).toBe('Name,Phone,Notes\r\n"Mary ""MJ"", Kamau",,"line1\nline2"');
  });

  it("cleans what the browser sends: drops unknown fields and keeps select choices", () => {
    const t = fromTemplate("ideas");
    const status = by(t, "Status");
    const c = cleanTopic({ ...t, color: "red", items: [{ id: "1", values: { [status]: "Done", ghost: "x" } }] });
    expect(c.color).toBe("#7cc242");
    expect(c.items[0].values).toEqual({ [status]: "Done" });
    expect(c.fields.find((f) => f.id === status)?.options).toEqual(["Idea", "Planning", "In progress", "Done"]);
  });
});
