"use client";

// Offline first: every read and write goes to IndexedDB on this device, so the
// calendar opens and saves instantly with or without a connection. Changes go
// into an outbox and are sent to Supabase whenever the device is online; other
// devices' changes are pulled in the same pass. The last change wins.
import { createBrowserClient } from "@supabase/ssr";
import type { CalEvent, Todo } from "./types";

const DB_NAME = "td-calendar";
const DB_VERSION = 1;
type Table = "events" | "todos";
type OutboxItem = { id?: number; table: Table; rowId: string };

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore("events", { keyPath: "id" });
      db.createObjectStore("todos", { keyPath: "id" });
      db.createObjectStore("outbox", { keyPath: "id", autoIncrement: true });
      db.createObjectStore("meta");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(stores: string[], mode: IDBTransactionMode, work: (t: IDBTransaction) => T | Promise<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(stores, mode);
        let result: T;
        Promise.resolve(work(t)).then((r) => (result = r), reject);
        t.oncomplete = () => resolve(result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }),
  );
}

function all<T>(store: IDBObjectStore): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const r = store.getAll();
    r.onsuccess = () => resolve(r.result as T[]);
    r.onerror = () => reject(r.error);
  });
}

const listeners = new Set<() => void>();
export function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const changed = () => listeners.forEach((fn) => fn());

export async function loadAll(ownerId: string, calendars?: string[]): Promise<{ events: CalEvent[]; todos: Todo[] }> {
  return tx(["events", "todos"], "readonly", async (t) => {
    const [events, todos] = await Promise.all([all<CalEvent>(t.objectStore("events")), all<Todo>(t.objectStore("todos"))]);
    // Events I own or was invited to; to-dos are mine only. Another person
    // signing in on this device never sees the first person's things.
    return {
      events: events.filter((e) => (e.ownerId === ownerId || e.invitees.includes(ownerId)) && (!calendars || calendars.includes(e.calendar))),
      todos: todos.filter((x) => x.ownerId === ownerId || x.assignedBy === ownerId),
    };
  });
}

async function save(table: Table, row: CalEvent | Todo) {
  await tx([table, "outbox"], "readwrite", (t) => {
    t.objectStore(table).put(row);
    t.objectStore("outbox").add({ table, rowId: row.id } satisfies OutboxItem);
  });
  changed();
  scheduleSync();
}

export function saveEvent(e: CalEvent) {
  return save("events", { ...e, updatedAt: new Date().toISOString() });
}

export function deleteEvent(e: CalEvent) {
  const now = new Date().toISOString();
  return save("events", { ...e, deletedAt: now, updatedAt: now });
}

export function saveTodo(x: Todo) {
  return save("todos", { ...x, updatedAt: new Date().toISOString() });
}

export function deleteTodo(x: Todo) {
  const now = new Date().toISOString();
  return save("todos", { ...x, deletedAt: now, updatedAt: now });
}

export function newId(): string {
  return crypto.randomUUID();
}

// ---------------------------------------------------------------- sync

export type SyncState = "offline" | "syncing" | "synced" | "local-only" | "error";
let state: SyncState = "synced";
const stateListeners = new Set<(s: SyncState) => void>();
export function onSyncState(fn: (s: SyncState) => void) {
  stateListeners.add(fn);
  fn(state);
  return () => stateListeners.delete(fn);
}
function setState(s: SyncState) {
  state = s;
  stateListeners.forEach((fn) => fn(s));
}

let localOnly = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let running = false;

/** Demo mode keeps everything on the device. */
export function setLocalOnly(v: boolean) {
  localOnly = v;
  if (v) setState("local-only");
}

export function scheduleSync(delay = 800) {
  if (localOnly) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void sync(), delay);
}

function client() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}

const toEventRow = (e: CalEvent) => ({
  id: e.id,
  owner_id: e.ownerId,
  title: e.title,
  starts_at: e.start,
  ends_at: e.end,
  all_day: e.allDay,
  calendar: e.calendar,
  location: e.location,
  notes: e.notes,
  repeat: e.repeat,
  repeat_until: e.repeatUntil,
  reminders: e.reminders,
  invitees: e.calendar === "personal" ? [] : e.invitees,
  updated_at: e.updatedAt,
  deleted_at: e.deletedAt,
});

type EventRow = ReturnType<typeof toEventRow>;
const fromEventRow = (r: EventRow): CalEvent => ({
  id: r.id,
  ownerId: r.owner_id,
  title: r.title,
  start: new Date(r.starts_at).toISOString(),
  end: new Date(r.ends_at).toISOString(),
  allDay: r.all_day,
  calendar: r.calendar,
  location: r.location,
  notes: r.notes,
  repeat: r.repeat,
  repeatUntil: r.repeat_until,
  reminders: r.reminders ?? [],
  invitees: r.invitees ?? [],
  updatedAt: new Date(r.updated_at).toISOString(),
  deletedAt: r.deleted_at,
});

const toTodoRow = (x: Todo) => ({
  id: x.id,
  owner_id: x.ownerId,
  title: x.title,
  assigned_by: x.assignedBy,
  ledger_id: x.ledgerId,
  scheduled_start: x.scheduledStart,
  duration_min: x.durationMin,
  due_on: x.dueOn,
  done_at: x.doneAt,
  updated_at: x.updatedAt,
  deleted_at: x.deletedAt,
});
type TodoRow = ReturnType<typeof toTodoRow>;
const fromTodoRow = (r: TodoRow): Todo => ({
  id: r.id,
  ownerId: r.owner_id,
  title: r.title,
  assignedBy: r.assigned_by,
  ledgerId: r.ledger_id,
  scheduledStart: r.scheduled_start ? new Date(r.scheduled_start).toISOString() : null,
  durationMin: r.duration_min,
  dueOn: r.due_on,
  doneAt: r.done_at,
  updatedAt: new Date(r.updated_at).toISOString(),
  deletedAt: r.deleted_at,
});

// Push reminders are scheduled by Supabase itself as events and tasks sync
// (supabase/migrations/0006_push_reminders.sql), so devices only send changes.

let syncUser: string | null = null;

/** The signed-in person; sync sends only their changes and keeps their place. */
export function setSyncUser(id: string) {
  syncUser = id;
}

// A refused row (for example one the server's rules don't allow) must not
// block everything else: the batch is retried row by row and refused rows
// are dropped. A network problem stops the sync so it is tried again later.
async function sendRows(sb: ReturnType<typeof client>, table: "calendar_events" | "todos", rows: object[]) {
  if (!rows.length) return;
  const { error } = await sb.from(table).upsert(rows);
  if (!error) return;
  if (!isRefusal(error)) throw error;
  for (const row of rows) {
    const { error: one } = await sb.from(table).upsert(row);
    if (one && !isRefusal(one)) throw one;
  }
}

function isRefusal(e: { code?: string }) {
  // Postgres rule, constraint or data errors, and PostgREST request errors.
  return !!e.code && /^(42|23|22|PGRST)/.test(e.code);
}

export async function sync(): Promise<void> {
  if (localOnly || running || !syncUser) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return setState("offline");
  running = true;
  setState("syncing");
  try {
    const sb = client();

    // 1. Send what changed on this device.
    const outbox = await tx(["outbox", "events", "todos"], "readonly", async (t) => {
      const items = await all<OutboxItem>(t.objectStore("outbox"));
      const rows = await Promise.all(
        items.map(
          (i) =>
            new Promise<{ item: OutboxItem; row: CalEvent | Todo | undefined }>((res) => {
              const r = t.objectStore(i.table).get(i.rowId);
              r.onsuccess = () => res({ item: i, row: r.result });
            }),
        ),
      );
      return rows;
    });
    // Only the signed-in person's own changes are sent. Changes left on this
    // device by someone who signed in before are not theirs to send.
    const latest = new Map<string, { table: Table; row: CalEvent | Todo }>();
    for (const { item, row } of outbox) {
      if (!row) continue;
      const mine = row.ownerId === syncUser || (item.table === "todos" && (row as Todo).assignedBy === syncUser);
      if (mine) latest.set(`${item.table}:${row.id}`, { table: item.table, row });
    }
    const events = [...latest.values()].filter((v) => v.table === "events").map((v) => toEventRow(v.row as CalEvent));
    const todos = [...latest.values()].filter((v) => v.table === "todos").map((v) => toTodoRow(v.row as Todo));
    await sendRows(sb, "calendar_events", events);
    await sendRows(sb, "todos", todos);
    const sentIds = outbox.map((o) => o.item.id!);
    if (sentIds.length) await tx(["outbox"], "readwrite", (t) => sentIds.forEach((id) => t.objectStore("outbox").delete(id)));

    // 2. Bring in what changed elsewhere since this person last synced here.
    const cursorKey = `cursor:${syncUser}`;
    const cursor = await tx(["meta"], "readonly", (t) => new Promise<string | undefined>((res) => {
      const r = t.objectStore("meta").get(cursorKey);
      r.onsuccess = () => res(r.result);
    }));
    const since = cursor ?? "1970-01-01T00:00:00Z";
    const [ev, td] = await Promise.all([
      sb.from("calendar_events").select("*").gt("synced_at", since).order("synced_at").limit(1000),
      sb.from("todos").select("*").gt("synced_at", since).order("synced_at").limit(1000),
    ]);
    if (ev.error) throw ev.error;
    if (td.error) throw td.error;

    let newest = since;
    await tx(["events", "todos"], "readwrite", async (t) => {
      const merge = async <T extends { id: string; updatedAt: string }>(store: IDBObjectStore, incoming: T[], stamps: string[]) => {
        for (const [i, row] of incoming.entries()) {
          const local = await new Promise<T | undefined>((res) => {
            const r = store.get(row.id);
            r.onsuccess = () => res(r.result);
          });
          if (!local || local.updatedAt <= row.updatedAt) store.put(row);
          const stamp = new Date(stamps[i]).toISOString();
          if (stamp > newest) newest = stamp;
        }
      };
      await merge(t.objectStore("events"), (ev.data as EventRow[]).map(fromEventRow), (ev.data as { synced_at: string }[]).map((r) => r.synced_at));
      await merge(t.objectStore("todos"), (td.data as TodoRow[]).map(fromTodoRow), (td.data as { synced_at: string }[]).map((r) => r.synced_at));
    });
    await tx(["meta"], "readwrite", (t) => t.objectStore("meta").put(newest, cursorKey));

    if ((ev.data?.length ?? 0) > 0 || (td.data?.length ?? 0) > 0) changed();
    setState("synced");
  } catch {
    setState(typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "error");
  } finally {
    running = false;
  }
}
