"use client";

import { useEffect, useRef, useState } from "react";
import { calendarInfo, type CalendarKind, type CalEvent, type Repeat } from "@/lib/calendar/types";
import { REPEAT_LABELS } from "@/lib/calendar/recurrence";
import { addDays, dayKey, startOfDay, toLocalInput } from "@/lib/calendar/dates";
import { CloseIcon } from "@/components/icons";

export interface Person {
  id: string;
  name: string;
  /** Companies the person is in (for who can be invited). */
  ledgers?: string[];
}

const REMINDERS: { label: string; value: number[] }[] = [
  { label: "No reminder", value: [] },
  { label: "At the start", value: [0] },
  { label: "10 minutes before", value: [10] },
  { label: "30 minutes before", value: [30] },
  { label: "1 hour before", value: [60] },
  { label: "1 day before", value: [1440] },
];

const field = "w-full rounded-2xl border border-line bg-white px-4 py-2.5 text-base outline-none focus:border-lime";

export function EventSheet({
  event,
  isNew,
  people,
  calendars,
  calendarNames,
  myId,
  onSave,
  onDelete,
  onClose,
}: {
  event: CalEvent;
  isNew: boolean;
  people: Person[];
  calendars: CalendarKind[];
  calendarNames: Record<string, string>;
  myId: string;
  onSave: (e: CalEvent) => void;
  onDelete: (e: CalEvent) => void;
  onClose: () => void;
}) {
  const [e, setE] = useState(event);
  const readOnly = event.ownerId !== myId;
  const titleRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof CalEvent>(k: K, v: CalEvent[K]) => setE((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    if (isNew) titleRef.current?.focus();
    const onKey = (ev: KeyboardEvent) => ev.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isNew, onClose]);

  const start = new Date(e.start);
  const end = new Date(e.end);
  const info = (k: CalendarKind) => calendarInfo(k, calendarNames);
  const shared = info(e.calendar).shared;
  // Only people in this company can be invited to its calendar.
  const invitable = people.filter((p) => p.id !== myId && (!p.ledgers || p.ledgers.includes(e.calendar)));

  const setStart = (v: string) => {
    const s = new Date(v);
    if (isNaN(s.getTime())) return;
    const length = end.getTime() - start.getTime();
    setE((x) => ({ ...x, start: s.toISOString(), end: new Date(s.getTime() + Math.max(length, 15 * 60_000)).toISOString() }));
  };
  const setAllDay = (allDay: boolean) => {
    const day = startOfDay(start);
    setE((x) => ({
      ...x,
      allDay,
      start: (allDay ? day : new Date(day.getFullYear(), day.getMonth(), day.getDate(), 9)).toISOString(),
      end: (allDay ? addDays(day, 1) : new Date(day.getFullYear(), day.getMonth(), day.getDate(), 10)).toISOString(),
    }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={isNew ? "New event" : "Edit event"}>
      <button className="absolute inset-0 bg-ink/25" aria-label="Close" onClick={onClose} />
      <form
        className="relative max-h-[92vh] w-full overflow-y-auto rounded-t-[1.75rem] bg-white p-5 shadow-2xl sm:max-w-lg sm:rounded-[1.75rem] sm:p-6"
        onSubmit={(ev) => {
          ev.preventDefault();
          if (!readOnly) onSave({ ...e, title: e.title.trim() || "Untitled", invitees: shared ? e.invitees.filter((id) => invitable.some((p) => p.id === id)) : [] });
        }}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <input
            ref={titleRef}
            value={e.title}
            onChange={(ev) => set("title", ev.target.value)}
            placeholder="Add a title"
            readOnly={readOnly}
            className="w-full border-0 bg-transparent text-xl font-semibold outline-none placeholder:text-ink/30"
            aria-label="Title"
          />
          <button type="button" onClick={onClose} className="rounded-full p-1.5 text-ink/60 hover:bg-surface" aria-label="Close">
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        {readOnly && <p className="mb-4 rounded-2xl bg-surface px-3 py-2 text-sm text-muted">Shared with you by {people.find((p) => p.id === e.ownerId)?.name ?? "someone"}. Only they can change it.</p>}

        <fieldset disabled={readOnly} className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Calendar">
            {calendars.map((k) => (
              <button
                type="button"
                key={k}
                role="radio"
                aria-checked={e.calendar === k}
                onClick={() => setE((x) => ({ ...x, calendar: k, invitees: x.invitees.filter((id) => people.find((p) => p.id === id)?.ledgers?.includes(k) ?? true) }))}
                className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm"
                style={e.calendar === k ? { borderColor: info(k).color, background: info(k).soft } : { borderColor: "var(--line)" }}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: info(k).color }} />
                {info(k).label}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-2.5 text-sm">
            <input type="checkbox" checked={e.allDay} onChange={(ev) => setAllDay(ev.target.checked)} className="h-4 w-4 accent-[#32cd32]" />
            All day
          </label>

          {e.allDay ? (
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm">
                <span className="mb-1 block text-muted">From</span>
                <input type="date" value={dayKey(start)} onChange={(ev) => ev.target.value && setStart(`${ev.target.value}T00:00`)} className={field} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-muted">To</span>
                <input
                  type="date"
                  value={dayKey(addDays(end, -1))}
                  min={dayKey(start)}
                  onChange={(ev) => ev.target.value && set("end", addDays(new Date(`${ev.target.value}T00:00`), 1).toISOString())}
                  className={field}
                />
              </label>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block text-muted">Starts</span>
                <input type="datetime-local" value={toLocalInput(start)} onChange={(ev) => setStart(ev.target.value)} className={field} />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-muted">Ends</span>
                <input
                  type="datetime-local"
                  value={toLocalInput(end)}
                  min={toLocalInput(start)}
                  onChange={(ev) => {
                    const v = new Date(ev.target.value);
                    if (!isNaN(v.getTime()) && v > start) set("end", v.toISOString());
                  }}
                  className={field}
                />
              </label>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block text-muted">Repeat</span>
              <select value={e.repeat} onChange={(ev) => set("repeat", ev.target.value as Repeat)} className={field}>
                {(Object.keys(REPEAT_LABELS) as Repeat[]).map((r) => (
                  <option key={r} value={r}>
                    {REPEAT_LABELS[r]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted">Reminder</span>
              <select
                value={JSON.stringify(e.reminders)}
                onChange={(ev) => set("reminders", JSON.parse(ev.target.value))}
                className={field}
              >
                {REMINDERS.map((r) => (
                  <option key={r.label} value={JSON.stringify(r.value)}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {e.repeat !== "none" && (
            <label className="text-sm">
              <span className="mb-1 block text-muted">Repeat until (optional)</span>
              <input type="date" value={e.repeatUntil ?? ""} min={dayKey(start)} onChange={(ev) => set("repeatUntil", ev.target.value || null)} className={field} />
            </label>
          )}

          <input value={e.location} onChange={(ev) => set("location", ev.target.value)} placeholder="Place, for example a school name" className={field} aria-label="Place" />
          <textarea value={e.notes} onChange={(ev) => set("notes", ev.target.value)} placeholder="Notes, decisions, agenda" rows={3} className={field} aria-label="Notes" />

          {shared ? (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm text-muted">Invite</span>
                <button
                  type="button"
                  className="text-sm font-medium text-lime-deep"
                  onClick={() => set("invitees", invitable.map((p) => p.id))}
                >
                  Invite everyone in {info(e.calendar).label}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {invitable.map((p) => {
                    const on = e.invitees.includes(p.id);
                    return (
                      <button
                        type="button"
                        key={p.id}
                        aria-pressed={on}
                        onClick={() => set("invitees", on ? e.invitees.filter((x) => x !== p.id) : [...e.invitees, p.id])}
                        className={`rounded-full border px-3 py-1.5 text-sm ${on ? "border-lime bg-lime-soft" : "border-line"}`}
                      >
                        {p.name.split(" ")[0]}
                      </button>
                    );
                  })}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted">Personal events are private. Only you see them.</p>
          )}
        </fieldset>

        {!readOnly && (
          <div className="mt-6 flex items-center justify-between gap-3">
            {!isNew ? (
              <button type="button" onClick={() => onDelete(e)} className="rounded-full px-4 py-2.5 text-sm font-semibold text-danger hover:bg-[#fdecea]">
                Delete
              </button>
            ) : (
              <span />
            )}
            <button className="rounded-full bg-lime px-6 py-2.5 text-sm font-semibold text-ink hover:brightness-95">{isNew ? "Add to calendar" : "Save"}</button>
          </div>
        )}
      </form>
    </div>
  );
}
