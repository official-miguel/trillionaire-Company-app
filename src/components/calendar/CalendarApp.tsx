"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addDays, addMonths, dayKey, startOfDay, startOfMonth, startOfWeek } from "@/lib/calendar/dates";
import { occurrences } from "@/lib/calendar/recurrence";
import { defaultReminders, parseQuickAdd } from "@/lib/calendar/quickAdd";
import { nextFreeSlot } from "@/lib/calendar/plan";
import { calendarInfo, type CalendarKind, type CalEvent, type Occurrence, type Todo } from "@/lib/calendar/types";
import * as store from "@/lib/calendar/store";
import { pushStatus, turnOnPush, type PushStatus } from "@/lib/calendar/push";
import { demoSeed } from "@/lib/calendar/demoSeed";
import { EventSheet, type Person } from "./EventSheet";
import { TimeGrid } from "./TimeGrid";
import { MonthGrid } from "./MonthGrid";
import { Agenda } from "./Agenda";
import { PlanPanel } from "./PlanPanel";
import { useReminders } from "./useReminders";

// Demo sample events are added once per page load, however often effects run.
let seeding: Promise<void> | null = null;

type View = "day" | "week" | "month" | "agenda";
const VIEWS: { id: View; label: string; key: string }[] = [
  { id: "day", label: "Day", key: "d" },
  { id: "week", label: "Week", key: "w" },
  { id: "month", label: "Month", key: "m" },
  { id: "agenda", label: "List", key: "a" },
];

const EXAMPLES = ["Lunch with Ruth tomorrow 1-2pm", "School visit Thika fri 10am for 3h #bidii", "Kesho 9am call Romeo", "every tuesday 7am gym", "Mum's birthday 24 oct"];

const SYNC_LABELS: Record<store.SyncState, string> = {
  synced: "Saved and synced",
  syncing: "Syncing…",
  offline: "Offline · saved on this device",
  "local-only": "Demo · saved on this device",
  error: "Saved on this device · will sync",
};

export interface CalendarPerson extends Person {
  ledgers: string[];
}

export function CalendarApp({
  me,
  people,
  calendars,
  calendarNames,
  assignIn,
  demo,
}: {
  me: Person;
  people: CalendarPerson[];
  /** Personal plus the companies this person is in. */
  calendars: CalendarKind[];
  calendarNames: Record<string, string>;
  /** Companies where this person may give tasks to others. */
  assignIn: string[];
  demo: boolean;
}) {
  const [view, setView] = useState<View>("week");
  const [cursor, setCursor] = useState(() => startOfDay(new Date()));
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [editing, setEditing] = useState<{ event: CalEvent; isNew: boolean } | null>(null);
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"event" | "todo">("event");
  const [forWhom, setForWhom] = useState<string>(me.id);
  const [hidden, setHidden] = useState<CalendarKind[]>([]);
  // After adding, the day view scrolls to the new event.
  const [focusTime, setFocusTime] = useState<Date | null>(null);
  const [sync, setSync] = useState<store.SyncState>("synced");
  const [example, setExample] = useState(0);
  const [push, setPush] = useState<PushStatus | "busy">("off");
  const input = useRef<HTMLInputElement>(null);
  const info = useCallback((k: CalendarKind) => calendarInfo(k, calendarNames), [calendarNames]);

  // People this person may give tasks to: anyone in a company where they hold the permission.
  const assignable = useMemo(() => people.filter((p) => p.id !== me.id && p.ledgers.some((l) => assignIn.includes(l))), [people, me.id, assignIn]);
  const names = useMemo(() => Object.fromEntries(people.map((p) => [p.id, p.name])), [people]);

  // Load from this device first, then sync.
  const reload = useCallback(async () => {
    const data = await store.loadAll(me.id, calendars);
    setEvents(data.events);
    setTodos(data.todos.filter((t) => !t.deletedAt));
  }, [me.id, calendars]);

  useEffect(() => {
    store.setLocalOnly(demo);
    store.setSyncUser(me.id);
    const unsub = store.subscribe(() => void reload());
    const unsync = store.onSyncState(setSync);
    (async () => {
      if (demo) {
        seeding ??= store.loadAll(me.id, calendars).then(async ({ events: existing }) => {
          if (existing.length === 0) for (const e of demoSeed(me.id, people, calendars)) await store.saveEvent(e);
        });
        await seeding;
      }
      await reload();
      void store.sync();
    })();
    const online = () => void store.sync();
    const offline = () => setSync(demo ? "local-only" : "offline");
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    const every = setInterval(() => void store.sync(), 60_000);
    if (window.innerWidth < 768) setView("day");
    void pushStatus().then(setPush);
    return () => {
      unsub();
      unsync();
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      clearInterval(every);
    };
  }, [demo, me.id, people, calendars, reload]);

  useEffect(() => {
    const id = setInterval(() => setExample((i) => (i + 1) % EXAMPLES.length), 3500);
    return () => clearInterval(id);
  }, []);

  useReminders(events);

  // What the current view shows.
  const range = useMemo(() => {
    if (view === "day") return { from: cursor, to: addDays(cursor, 1), days: [cursor] };
    if (view === "week") {
      const s = startOfWeek(cursor);
      return { from: s, to: addDays(s, 7), days: Array.from({ length: 7 }, (_, i) => addDays(s, i)) };
    }
    if (view === "month") {
      const s = startOfWeek(startOfMonth(cursor));
      return { from: s, to: addDays(s, 42), days: [] };
    }
    return { from: startOfDay(new Date()), to: addDays(startOfDay(new Date()), 30), days: [] };
  }, [view, cursor]);

  const visible = useMemo(() => events.filter((e) => !hidden.includes(e.calendar)), [events, hidden]);
  const occ = useMemo(() => occurrences(visible, range.from, range.to), [visible, range]);
  const myTodos = useMemo(() => todos.filter((t) => t.ownerId === me.id), [todos, me.id]);
  const given = useMemo(() => todos.filter((t) => t.assignedBy === me.id && t.ownerId !== me.id), [todos, me.id]);

  const parsed = useMemo(() => {
    if (!text.trim()) return null;
    const p = parseQuickAdd(text);
    // A tag for a company the person is not in is ignored.
    return { ...p, calendar: p.calendar && calendars.includes(p.calendar) ? p.calendar : null };
  }, [text, calendars]);

  const title =
    view === "month" || view === "week"
      ? (view === "week" ? startOfWeek(cursor) : cursor).toLocaleDateString("en-KE", { month: "long", year: "numeric" })
      : view === "day"
        ? cursor.toLocaleDateString("en-KE", { weekday: "long", day: "numeric", month: "long" })
        : "Next 30 days";

  const move = useCallback(
    (dir: number) => {
      setCursor((c) => (view === "month" ? addMonths(startOfMonth(c), dir) : addDays(c, view === "week" ? 7 * dir : dir)));
    },
    [view],
  );

  const blank = useCallback(
    (start: Date, over: Partial<CalEvent> = {}): CalEvent => ({
      id: store.newId(),
      ownerId: me.id,
      title: "",
      start: start.toISOString(),
      end: new Date(start.getTime() + 60 * 60_000).toISOString(),
      allDay: false,
      calendar: "personal",
      location: "",
      notes: "",
      repeat: "none",
      repeatUntil: null,
      reminders: defaultReminders(start, false),
      invitees: [],
      updatedAt: new Date().toISOString(),
      deletedAt: null,
      ...over,
    }),
    [me.id],
  );

  const newTodo = (title: string, over: Partial<Todo> = {}): Todo => ({
    id: store.newId(),
    ownerId: me.id,
    title,
    assignedBy: null,
    ledgerId: null,
    scheduledStart: null,
    durationMin: 30,
    dueOn: null,
    doneAt: null,
    updatedAt: "",
    deletedAt: null,
    ...over,
  });

  const addFromText = () => {
    if (!parsed) return;
    if (mode === "todo") {
      // "Send invoices fri 10am" gets a slot; "Send invoices fri" gets a due day.
      const hasDate = parsed.understood.some((u) => u.endsWith("all day") || u.includes("–"));
      const timing: Partial<Todo> = !parsed.allDay
        ? { scheduledStart: parsed.start.toISOString(), durationMin: Math.min(720, Math.max(5, Math.round((parsed.end.getTime() - parsed.start.getTime()) / 60_000))) }
        : hasDate
          ? { dueOn: dayKey(parsed.start) }
          : {};
      if (forWhom === me.id) {
        void store.saveTodo(newTodo(parsed.title, timing));
      } else {
        const person = people.find((p) => p.id === forWhom);
        const ledger = (parsed.calendar && assignIn.includes(parsed.calendar) && person?.ledgers.includes(parsed.calendar) ? parsed.calendar : null) ?? assignIn.find((l) => person?.ledgers.includes(l));
        if (!ledger) return;
        void store.saveTodo(newTodo(parsed.title, { ...timing, ownerId: forWhom, assignedBy: me.id, ledgerId: ledger }));
      }
    } else {
      void store.saveEvent(
        blank(parsed.start, {
          title: parsed.title,
          end: parsed.end.toISOString(),
          allDay: parsed.allDay,
          repeat: parsed.repeat,
          calendar: parsed.calendar ?? "personal",
          reminders: parsed.reminders ?? defaultReminders(parsed.start, parsed.allDay),
        }),
      );
      setCursor(startOfDay(parsed.start));
      setFocusTime(parsed.allDay ? null : parsed.start);
      if (view === "month" || view === "agenda") setView("day");
    }
    setText("");
  };

  const planTodo = (t: Todo) => {
    const busy = occurrences(events, startOfDay(new Date()), addDays(new Date(), 8))
      .filter((o) => !o.event.allDay)
      .map((o) => ({ start: o.start, end: o.end }))
      .concat(myTodos.filter((x) => x.scheduledStart && !x.doneAt && x.id !== t.id).map((x) => ({ start: new Date(x.scheduledStart!), end: new Date(new Date(x.scheduledStart!).getTime() + x.durationMin * 60_000) })));
    const slot = nextFreeSlot(busy, t.durationMin, new Date());
    if (slot) {
      void store.saveTodo({ ...t, scheduledStart: slot.toISOString() });
      setCursor(startOfDay(slot));
      if (view === "month" || view === "agenda") setView("day");
    }
  };

  // Keyboard: t today, d/w/m/a views, n or / to type, arrows to move.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (editing || el.closest("input, textarea, select, [contenteditable]") || e.metaKey || e.ctrlKey || e.altKey) return;
      const v = VIEWS.find((x) => x.key === e.key);
      if (v) setView(v.id);
      else if (e.key === "t") setCursor(startOfDay(new Date()));
      else if (e.key === "ArrowLeft" || e.key === "j") move(-1);
      else if (e.key === "ArrowRight" || e.key === "k") move(1);
      else if (e.key === "n" || e.key === "/") {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, move]);

  const open = (o: Occurrence) => setEditing({ event: o.event, isNew: false });
  const toggleTodo = (t: Todo) => void store.saveTodo({ ...t, doneAt: t.doneAt ? null : new Date().toISOString() });
  const shownCal = info(parsed?.calendar ?? "personal");

  return (
    // Phones: the calendar takes most of the screen and tasks follow below.
    // Laptops: everything fits the window, with tasks at the side.
    <div className="flex flex-col gap-4 lg:h-[calc(100dvh-5rem)] lg:min-h-[34rem] lg:flex-row">
      <div className="flex min-w-0 flex-1 flex-col gap-3 lg:min-h-0">
        {/* Type it like you say it */}
        <form
          className="card flex flex-col gap-2 p-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            addFromText();
          }}
        >
          <div className="flex items-center gap-2">
            <div className="flex shrink-0 rounded-full bg-surface p-0.5 text-xs font-medium" role="tablist" aria-label="Add as">
              {(["event", "todo"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={mode === m}
                  onClick={() => setMode(m)}
                  className={`rounded-full px-3 py-1.5 ${mode === m ? "bg-white shadow-sm" : "text-ink/60"}`}
                >
                  {m === "event" ? "Event" : "Task"}
                </button>
              ))}
            </div>
            <input
              ref={input}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={mode === "event" ? `Try: ${EXAMPLES[example]}` : "A task, for example: send Term 1 invoices fri"}
              className="min-w-0 flex-1 bg-transparent px-1 py-1.5 text-[15px] outline-none placeholder:text-ink/35"
              aria-label="Type an event or task"
              enterKeyHint="done"
            />
            <button disabled={!parsed} className="shrink-0 rounded-full bg-lime px-4 py-2 text-sm font-semibold text-ink transition hover:brightness-95 disabled:opacity-40">
              Add
            </button>
          </div>
          {mode === "todo" && assignable.length > 0 && (
            <label className="flex items-center gap-2 px-1 text-xs text-muted">
              For
              <select value={forWhom} onChange={(e) => setForWhom(e.target.value)} className="rounded-full border border-line bg-white px-2.5 py-1 text-xs text-ink">
                <option value={me.id}>Me</option>
                {assignable.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              {forWhom !== me.id && <span>It will appear on their calendar and to-do list.</span>}
            </label>
          )}
          {parsed && (
            <p className="flex flex-wrap items-center gap-1.5 px-1 pb-0.5 text-xs text-muted">
              <span className="font-medium text-ink">{parsed.title}</span>
              {parsed.understood.map((u) => (
                <span key={u} className="rounded-full bg-lime-soft px-2 py-0.5 text-lime-deep">
                  {u}
                </span>
              ))}
              {mode === "event" && (
                <span className="rounded-full px-2 py-0.5" style={{ background: shownCal.soft, color: shownCal.color }}>
                  {shownCal.label}
                </span>
              )}
            </p>
          )}
        </form>

        <div className="card flex h-[72dvh] min-h-[26rem] flex-col overflow-hidden lg:h-auto lg:min-h-0 lg:flex-1">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5">
            <button onClick={() => setCursor(startOfDay(new Date()))} className="rounded-full border border-line px-3.5 py-1.5 text-sm font-medium hover:border-ink/30">
              Today
            </button>
            {view !== "agenda" && (
              <div className="flex">
                <button onClick={() => move(-1)} className="rounded-full p-1.5 text-lg leading-none hover:bg-surface" aria-label="Previous">
                  ‹
                </button>
                <button onClick={() => move(1)} className="rounded-full p-1.5 text-lg leading-none hover:bg-surface" aria-label="Next">
                  ›
                </button>
              </div>
            )}
            <h1 className="min-w-0 flex-1 truncate text-base font-semibold sm:text-lg">{title}</h1>
            <div className="flex rounded-full bg-surface p-0.5 text-sm" role="tablist" aria-label="View">
              {VIEWS.map((v) => (
                <button
                  key={v.id}
                  role="tab"
                  aria-selected={view === v.id}
                  title={`${v.label} (${v.key})`}
                  onClick={() => setView(v.id)}
                  className={`rounded-full px-3 py-1 ${view === v.id ? "bg-ink font-medium text-white" : "text-ink/65 hover:text-ink"}`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          {(view === "day" || view === "week") && (
            <TimeGrid
              focusTime={focusTime}
              days={range.days}
              occurrences={occ}
              todos={myTodos}
              names={names}
              onOpen={open}
              onPickSlot={(start) => setEditing({ event: blank(start), isNew: true })}
              onToggleTodo={toggleTodo}
            />
          )}
          {view === "month" && (
            <MonthGrid
              cursor={cursor}
              occurrences={occ}
              onOpen={open}
              onPickDay={(d) => {
                setCursor(d);
                setView("day");
              }}
            />
          )}
          {view === "agenda" && <Agenda occurrences={occ} onOpen={open} />}
        </div>
      </div>

      {/* Side panel: plan, calendars, status */}
      <aside className="card flex shrink-0 flex-col gap-5 overflow-y-auto p-4 lg:w-72">
        <PlanPanel
          todos={myTodos}
          given={given}
          names={names}
          onAdd={(title) => void store.saveTodo(newTodo(title))}
          onToggle={toggleTodo}
          onPlan={planTodo}
          onUnplan={(t) => void store.saveTodo({ ...t, scheduledStart: null })}
          onDelete={(t) => void store.deleteTodo(t)}
        />

        <section aria-label="Calendars">
          <h2 className="mb-2 text-sm font-semibold">Calendars</h2>
          <ul className="flex flex-col gap-1">
            {calendars.map((k) => (
              <li key={k}>
                <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-1.5 py-1 text-sm hover:bg-surface">
                  <input
                    type="checkbox"
                    checked={!hidden.includes(k)}
                    onChange={() => setHidden((h) => (h.includes(k) ? h.filter((x) => x !== k) : [...h, k]))}
                    className="h-4 w-4"
                    style={{ accentColor: info(k).color }}
                  />
                  {info(k).label}
                  {!info(k).shared && <span className="text-xs text-muted">private</span>}
                </label>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-auto flex flex-col gap-2 text-xs text-muted">
          {(push === "off" || push === "busy") && (
            <button
              disabled={push === "busy"}
              onClick={async () => {
                setPush("busy");
                setPush(await turnOnPush().catch(() => "off" as const));
              }}
              className="rounded-full border border-line px-3 py-2 text-sm font-medium text-ink hover:border-ink/30 disabled:opacity-50"
            >
              {push === "busy" ? "Turning on…" : "Turn on reminders"}
            </button>
          )}
          {push === "on" && <p className="text-lime-deep">Reminders on for this device, even when the app is closed.</p>}
          {push === "blocked" && <p>Reminders are blocked for this site. Allow notifications in your browser settings to get them.</p>}
          {push === "needs-install" && <p>On iPhone, add this app to your Home Screen (Share → Add to Home Screen) to get reminders.</p>}
          <p className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${sync === "synced" ? "bg-lime" : sync === "syncing" ? "animate-pulse bg-lime" : "bg-warn"}`} />
            {SYNC_LABELS[sync]}
          </p>
          <p className="hidden lg:block">Keys: t today · d w m a views · n type · ← → move</p>
        </section>
      </aside>

      {/* Phones: a big add button, always within thumb reach. */}
      {!editing && (
        <button
          onClick={() => {
            const n = new Date();
            const start = new Date(n.getFullYear(), n.getMonth(), n.getDate(), n.getHours(), n.getMinutes() < 30 ? 30 : 60);
            setEditing({ event: blank(start), isNew: true });
          }}
          className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-lime text-3xl font-light text-ink shadow-[0_8px_24px_rgba(0,0,0,0.18)] active:scale-95 lg:hidden"
          aria-label="Add an event"
        >
          +
        </button>
      )}

      {editing && (
        <EventSheet
          key={editing.event.id}
          event={editing.event}
          isNew={editing.isNew}
          people={people}
          calendars={calendars}
          calendarNames={calendarNames}
          myId={me.id}
          onClose={() => setEditing(null)}
          onSave={(e) => {
            void store.saveEvent(e);
            setEditing(null);
          }}
          onDelete={(e) => {
            void store.deleteEvent(e);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
