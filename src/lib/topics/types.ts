// Custom topics: your own sections beside Trillionaire Designs and Bidii (the
// "+" tab on Money). A topic is whatever you set it up to be, with no coding:
// fields, items, totals, a money in/out balance, search, sort and export.
export type FieldType = "text" | "number" | "money" | "date" | "checkbox" | "notes" | "select" | "link";
export const FIELD_TYPES: { type: FieldType; label: string }[] = [
  { type: "text", label: "Text note" },
  { type: "number", label: "Number" },
  { type: "money", label: "Money amount (KES)" },
  { type: "date", label: "Date" },
  { type: "checkbox", label: "Checkbox / to-do" },
  { type: "select", label: "Choice list (status, type…)" },
  { type: "link", label: "Link / web address" },
  { type: "notes", label: "Notes area" },
];

export interface TopicField {
  id: string;
  label: string;
  type: FieldType;
  /** For "select": the choices. */
  options?: string[];
}
export type CellValue = string | number | boolean | null;
export interface TopicItem {
  id: string;
  values: Record<string, CellValue>;
}
export interface Topic {
  id: string;
  name: string;
  icon: string;
  color: string;
  fields: TopicField[];
  items: TopicItem[];
  position: number;
}
export type TopicTab = Pick<Topic, "id" | "name" | "icon" | "color">;

export const TOPIC_ICONS = ["📌", "🌱", "⛪", "💼", "🏠", "🚗", "🎓", "💡", "🛒", "❤️", "⭐", "📚", "💰", "✅", "👤", "🐄", "🏗️", "✈️", "🎯", "🔧"];
export const TOPIC_COLORS = ["#7cc242", "#2f80ed", "#f2994a", "#eb5757", "#9b51e0", "#00a3a3", "#555555"];

export const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

type FieldSeed = Omit<TopicField, "id">;
export const TEMPLATES: { id: string; label: string; hint: string; icon: string; fields: FieldSeed[] }[] = [
  { id: "blank", label: "Blank", hint: "Start empty and add your own fields", icon: "📌", fields: [{ label: "Item", type: "text" }] },
  {
    id: "money",
    label: "Money tracker",
    hint: "Money in and out with a running balance",
    icon: "💰",
    fields: [
      { label: "Date", type: "date" },
      { label: "What", type: "text" },
      { label: "Type", type: "select", options: ["In", "Out"] },
      { label: "Amount", type: "money" },
      { label: "Notes", type: "notes" },
    ],
  },
  {
    id: "todo",
    label: "To-do list",
    hint: "Tasks with a due date and a tick",
    icon: "✅",
    fields: [
      { label: "Task", type: "text" },
      { label: "Due", type: "date" },
      { label: "Done", type: "checkbox" },
      { label: "Notes", type: "notes" },
    ],
  },
  {
    id: "ideas",
    label: "Ideas & projects",
    hint: "Ideas with a status and a cost",
    icon: "💡",
    fields: [
      { label: "Idea", type: "text" },
      { label: "Status", type: "select", options: ["Idea", "Planning", "In progress", "Done"] },
      { label: "Cost", type: "money" },
      { label: "Link", type: "link" },
      { label: "Notes", type: "notes" },
    ],
  },
  {
    id: "contacts",
    label: "People & contacts",
    hint: "Names, phones and notes",
    icon: "👤",
    fields: [
      { label: "Name", type: "text" },
      { label: "Phone", type: "text" },
      { label: "Notes", type: "notes" },
    ],
  },
];

export function templateFields(id: string): { fields: TopicField[]; icon: string } {
  const t = TEMPLATES.find((x) => x.id === id) ?? TEMPLATES[0];
  return { icon: t.icon, fields: t.fields.map((f) => ({ ...f, options: f.options ? [...f.options] : undefined, id: newId() })) };
}

const num = (v: CellValue | undefined) => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : 0;
};

/** Sum of every number and money field. Blank and non-numeric cells count as 0. */
export function fieldTotals(topic: Pick<Topic, "fields" | "items">) {
  return topic.fields
    .filter((f) => f.type === "number" || f.type === "money")
    .map((f) => ({ field: f, total: topic.items.reduce((s, it) => s + num(it.values[f.id]), 0) }));
}

const IN = /^(in|income|money in|received|deposit)$/i;
const OUT = /^(out|expense|expenses|money out|spent|withdrawal)$/i;

/**
 * If the topic has a choice list with an "In" and an "Out" option and a money
 * (or number) field, it behaves like a ledger: money in, money out, balance.
 */
export function ledgerSummary(topic: Pick<Topic, "fields" | "items">) {
  const type = topic.fields.find((f) => f.type === "select" && f.options?.some((o) => IN.test(o)) && f.options?.some((o) => OUT.test(o)));
  const amount = topic.fields.find((f) => f.type === "money") ?? topic.fields.find((f) => f.type === "number");
  if (!type || !amount) return null;
  let moneyIn = 0;
  let moneyOut = 0;
  for (const it of topic.items) {
    const t = String(it.values[type.id] ?? "");
    if (IN.test(t)) moneyIn += num(it.values[amount.id]);
    else if (OUT.test(t)) moneyOut += num(it.values[amount.id]);
  }
  return { label: amount.label || "Amount", moneyIn, moneyOut, balance: moneyIn - moneyOut };
}

/** Ticked / total for the first checkbox field, if there is one. */
export function doneSummary(topic: Pick<Topic, "fields" | "items">) {
  const f = topic.fields.find((x) => x.type === "checkbox");
  if (!f) return null;
  return { label: f.label || "Done", done: topic.items.filter((it) => it.values[f.id] === true).length, total: topic.items.length };
}

/** The topic as a CSV file (opens in Excel or Google Sheets). */
export function toCsv(topic: Pick<Topic, "fields" | "items">): string {
  const esc = (v: CellValue | undefined) => {
    const s = v === null || v === undefined ? "" : typeof v === "boolean" ? (v ? "Yes" : "No") : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = topic.fields.map((f) => esc(f.label || "Untitled")).join(",");
  const rows = topic.items.map((it) => topic.fields.map((f) => esc(it.values[f.id])).join(","));
  return [head, ...rows].join("\r\n");
}

/** Keep only well-formed data coming from the browser. */
export function cleanTopic(t: Topic): Topic {
  const types = new Set<string>(FIELD_TYPES.map((x) => x.type));
  const fields: TopicField[] = (t.fields ?? []).slice(0, 40).map((f) => {
    const type = (types.has(f.type) ? f.type : "text") as FieldType;
    const clean: TopicField = { id: String(f.id).slice(0, 40), label: String(f.label ?? "").slice(0, 60), type };
    if (type === "select") clean.options = (f.options ?? []).map((o) => String(o).trim().slice(0, 40)).filter(Boolean).slice(0, 30);
    return clean;
  });
  const ids = new Set(fields.map((f) => f.id));
  const items: TopicItem[] = (t.items ?? []).slice(0, 5000).map((it) => ({
    id: String(it.id).slice(0, 40),
    values: Object.fromEntries(
      Object.entries(it.values ?? {})
        .filter(([k, v]) => ids.has(k) && (v === null || ["string", "number", "boolean"].includes(typeof v)))
        .map(([k, v]) => [k, typeof v === "string" ? v.slice(0, 5000) : v]),
    ) as TopicItem["values"],
  }));
  return {
    id: t.id,
    name: String(t.name ?? "").trim().slice(0, 60) || "Untitled",
    icon: String(t.icon ?? "📌").slice(0, 8),
    color: /^#[0-9a-f]{6}$/i.test(t.color) ? t.color : "#7cc242",
    fields,
    items,
    position: Number(t.position) || 0,
  };
}
