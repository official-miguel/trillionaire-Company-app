import "server-only";
import { isDemo } from "@/lib/demo";
import { supabaseServer } from "@/lib/supabase/server";
import { cleanTopic, newId, templateFields, type Topic } from "./types";

// Supabase (custom_topics: each person sees only their own, by row level
// security). Demo mode has no database, so it keeps topics in server memory.
const mem = globalThis as unknown as { __topics?: Map<string, Topic> };
const demoStore = () => (mem.__topics ??= new Map());

const fromRow = (r: Record<string, unknown>): Topic =>
  cleanTopic({
    id: r.id as string,
    name: r.name as string,
    icon: r.icon as string,
    color: r.color as string,
    fields: r.fields as Topic["fields"],
    items: r.items as Topic["items"],
    position: r.position as number,
  });

export async function listTopicsDb(): Promise<Topic[]> {
  if (isDemo()) return [...demoStore().values()].sort((a, b) => a.position - b.position);
  const sb = await supabaseServer();
  const { data, error } = await sb.from("custom_topics").select("*").order("position").order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []).map(fromRow);
}

async function insert(base: Topic): Promise<Topic> {
  if (isDemo()) {
    const t = { ...base, id: crypto.randomUUID() };
    demoStore().set(t.id, t);
    return t;
  }
  const sb = await supabaseServer();
  const { data, error } = await sb
    .from("custom_topics")
    .insert({ name: base.name, icon: base.icon, color: base.color, fields: base.fields, items: base.items, position: base.position })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return fromRow(data);
}

export async function createTopicDb(name: string, template = "blank"): Promise<Topic> {
  const existing = await listTopicsDb();
  const { fields, icon } = templateFields(template);
  return insert(cleanTopic({ id: "", name, icon, color: "#7cc242", fields, items: [], position: existing.length }));
}

/** A copy with its fields and items (new ids), named "<name> copy". */
export async function duplicateTopicDb(id: string): Promise<Topic> {
  const all = await listTopicsDb();
  const src = all.find((t) => t.id === id);
  if (!src) throw new Error("That topic no longer exists.");
  return insert(cleanTopic({ ...src, id: "", name: `${src.name} copy`.slice(0, 60), items: src.items.map((it) => ({ ...it, id: newId() })), position: all.length }));
}

export async function saveTopicDb(t: Topic): Promise<void> {
  const c = cleanTopic(t);
  if (isDemo()) {
    if (demoStore().has(c.id)) demoStore().set(c.id, c);
    return;
  }
  const sb = await supabaseServer();
  const { error } = await sb
    .from("custom_topics")
    .update({ name: c.name, icon: c.icon, color: c.color, fields: c.fields, items: c.items, position: c.position, updated_at: new Date().toISOString() })
    .eq("id", c.id);
  if (error) throw new Error(error.message);
}

export async function deleteTopicDb(id: string): Promise<void> {
  if (isDemo()) {
    demoStore().delete(id);
    return;
  }
  const sb = await supabaseServer();
  const { error } = await sb.from("custom_topics").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
