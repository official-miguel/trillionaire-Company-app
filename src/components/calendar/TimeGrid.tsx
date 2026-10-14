"use client";

import { useEffect, useRef, useState } from "react";
import { addDays, dayKey, minutesIntoDay, sameDay, startOfDay, timeLabel } from "@/lib/calendar/dates";
import { placeDay } from "@/lib/calendar/layout";
import { calendarInfo, type Occurrence, type Todo } from "@/lib/calendar/types";

const HOUR = 52; // px per hour

export function TimeGrid({
  days,
  occurrences,
  todos,
  names,
  onPickSlot,
  onOpen,
  onToggleTodo,
}: {
  days: Date[];
  occurrences: Occurrence[];
  todos: Todo[];
  names: Record<string, string>;
  onPickSlot: (start: Date) => void;
  onOpen: (o: Occurrence) => void;
  onToggleTodo: (t: Todo) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Open at 7am, or an hour before now if that is later in the day.
  useEffect(() => {
    const h = days.some((d) => sameDay(d, new Date())) ? Math.max(7, new Date().getHours() - 1) : 7;
    scroller.current?.scrollTo({ top: h * HOUR });
  }, [days]);

  const allDay = occurrences.filter((o) => o.event.allDay || o.end.getTime() - o.start.getTime() >= 86_400_000);
  // Tasks with a due day but no time sit in the all-day row.
  const dueTasks = todos.filter((t) => t.dueOn && !t.scheduledStart);
  const from = (t: Todo) => (t.assignedBy ? ` · from ${(names[t.assignedBy] ?? "").split(" ")[0]}` : "");
  const timed = occurrences.filter((o) => !allDay.includes(o));
  const cols = `3.25rem repeat(${days.length}, minmax(0, 1fr))`;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Day headings */}
      <div className="grid border-b border-line" style={{ gridTemplateColumns: cols }}>
        <span />
        {days.map((d) => {
          const today = sameDay(d, now);
          return (
            <div key={d.toISOString()} className="flex flex-col items-center py-2">
              <span className={`text-[11px] uppercase tracking-wide ${today ? "text-lime-deep" : "text-muted"}`}>{d.toLocaleDateString("en-KE", { weekday: "short" })}</span>
              <span className={`mt-0.5 flex h-8 w-8 items-center justify-center rounded-full text-lg font-semibold ${today ? "bg-lime text-ink" : ""}`}>{d.getDate()}</span>
            </div>
          );
        })}
      </div>

      {/* All-day row */}
      {(allDay.length > 0 || dueTasks.some((t) => days.some((d) => dayKey(d) === t.dueOn))) && (
        <div className="grid border-b border-line py-1" style={{ gridTemplateColumns: cols }}>
          <span className="pr-2 pt-1 text-right text-[10px] text-muted">all day</span>
          {days.map((d) => (
            <div key={d.toISOString()} className="flex min-w-0 flex-col gap-1 px-0.5">
              {allDay
                .filter((o) => o.start < addDays(startOfDay(d), 1) && o.end > startOfDay(d))
                .map((o) => (
                  <button
                    key={o.key}
                    onClick={() => onOpen(o)}
                    className="truncate rounded-md px-1.5 py-0.5 text-left text-xs font-medium"
                    style={{ background: calendarInfo(o.event.calendar).soft, color: calendarInfo(o.event.calendar).color }}
                  >
                    {o.event.title}
                  </button>
                ))}
              {dueTasks
                .filter((t) => t.dueOn === dayKey(d))
                .map((t) => (
                  <label key={t.id} className="flex min-w-0 items-center gap-1 rounded-md border border-dashed border-ink/25 px-1.5 py-0.5 text-xs">
                    <input type="checkbox" checked={!!t.doneAt} onChange={() => onToggleTodo(t)} className="h-3 w-3 shrink-0 accent-[#32cd32]" aria-label={`Done: ${t.title}`} />
                    <span className={`truncate ${t.doneAt ? "text-muted line-through" : ""}`}>
                      {t.title}
                      {from(t)}
                    </span>
                  </label>
                ))}
            </div>
          ))}
        </div>
      )}

      {/* Hours */}
      <div ref={scroller} className="relative min-h-0 flex-1 overflow-y-auto">
        <div className="grid" style={{ gridTemplateColumns: cols, height: 24 * HOUR }}>
          <div className="relative">
            {Array.from({ length: 23 }, (_, i) => (
              <span key={i} className="absolute right-2 -translate-y-1/2 text-[10px] text-muted" style={{ top: (i + 1) * HOUR }}>
                {`${String(i + 1).padStart(2, "0")}:00`}
              </span>
            ))}
          </div>
          {days.map((d) => {
            const dayStart = startOfDay(d);
            const dayEnd = addDays(dayStart, 1);
            const mine = timed.filter((o) => o.start < dayEnd && o.end > dayStart);
            const planned = todos.filter((t) => t.scheduledStart && sameDay(new Date(t.scheduledStart), d));
            return (
              <div
                key={d.toISOString()}
                className="relative border-l border-line"
                style={{ backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${HOUR - 1}px, var(--line) ${HOUR - 1}px, var(--line) ${HOUR}px)` }}
                onClick={(ev) => {
                  if (ev.target !== ev.currentTarget) return;
                  const y = ev.nativeEvent.offsetY;
                  const minutes = Math.floor((y / HOUR) * 4) * 15;
                  onPickSlot(new Date(dayStart.getFullYear(), dayStart.getMonth(), dayStart.getDate(), 0, minutes));
                }}
              >
                {placeDay(mine).map(({ occ, col, cols: n }) => {
                  const s = Math.max(occ.start.getTime(), dayStart.getTime());
                  const e = Math.min(occ.end.getTime(), dayEnd.getTime());
                  const top = (minutesIntoDay(new Date(s)) / 60) * HOUR;
                  const height = Math.max(((e - s) / 3_600_000) * HOUR, 22);
                  const cal = calendarInfo(occ.event.calendar);
                  return (
                    <button
                      key={occ.key}
                      onClick={() => onOpen(occ)}
                      className="absolute overflow-hidden rounded-lg border-l-[3px] px-1.5 py-1 text-left text-xs shadow-[0_1px_2px_rgba(0,0,0,0.06)] transition hover:z-10 hover:shadow-md"
                      style={{ top, height, left: `calc(${(col / n) * 100}% + 2px)`, width: `calc(${100 / n}% - 4px)`, background: cal.soft, borderColor: cal.color }}
                    >
                      <span className="block truncate font-semibold text-ink">{occ.event.title}</span>
                      {height > 34 && (
                        <span className="block truncate text-ink/60">
                          {timeLabel(occ.start)}
                          {occ.event.location ? ` · ${occ.event.location}` : ""}
                        </span>
                      )}
                    </button>
                  );
                })}
                {planned.map((t) => {
                  const s = new Date(t.scheduledStart!);
                  return (
                    <div
                      key={t.id}
                      className="absolute left-0.5 right-0.5 flex items-start gap-1.5 overflow-hidden rounded-lg border border-dashed border-ink/25 bg-white/90 px-1.5 py-1 text-xs"
                      style={{ top: (minutesIntoDay(s) / 60) * HOUR, height: Math.max((t.durationMin / 60) * HOUR, 22) }}
                    >
                      <input
                        type="checkbox"
                        checked={!!t.doneAt}
                        onChange={() => onToggleTodo(t)}
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[#32cd32]"
                        aria-label={`Done: ${t.title}`}
                      />
                      <span className={`truncate ${t.doneAt ? "text-muted line-through" : ""}`}>
                        {t.title}
                        {from(t)}
                      </span>
                    </div>
                  );
                })}
                {sameDay(d, now) && (
                  <div className="pointer-events-none absolute left-0 right-0 z-20" style={{ top: (minutesIntoDay(now) / 60) * HOUR }}>
                    <div className="relative h-0.5 bg-lime-deep">
                      <span className="absolute -left-1 -top-[3px] h-2 w-2 rounded-full bg-lime-deep" />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
