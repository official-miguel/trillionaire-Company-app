"use client";

import { addDays, monthGrid, sameDay, startOfDay, timeLabel } from "@/lib/calendar/dates";
import { calendarInfo, type Occurrence } from "@/lib/calendar/types";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function MonthGrid({
  cursor,
  occurrences,
  onPickDay,
  onOpen,
}: {
  cursor: Date;
  occurrences: Occurrence[];
  onPickDay: (d: Date) => void;
  onOpen: (o: Occurrence) => void;
}) {
  const days = monthGrid(cursor);
  const today = new Date();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid grid-cols-7 border-b border-line">
        {WEEKDAYS.map((w) => (
          <span key={w} className="py-2 text-center text-[11px] uppercase tracking-wide text-muted">
            {w}
          </span>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6">
        {days.map((d) => {
          const start = startOfDay(d);
          const end = addDays(start, 1);
          const items = occurrences.filter((o) => o.start < end && o.end > start);
          const inMonth = d.getMonth() === cursor.getMonth();
          return (
            <div key={d.toISOString()} className={`flex min-h-[5.5rem] min-w-0 flex-col gap-0.5 border-b border-r border-line p-1 ${inMonth ? "" : "bg-surface/60"}`}>
              <button
                onClick={() => onPickDay(d)}
                className={`mb-0.5 flex h-7 w-7 items-center justify-center self-start rounded-full text-sm ${
                  sameDay(d, today) ? "bg-lime font-semibold text-ink" : inMonth ? "text-ink hover:bg-surface" : "text-ink/35 hover:bg-surface"
                }`}
                aria-label={d.toLocaleDateString("en-KE", { weekday: "long", day: "numeric", month: "long" })}
              >
                {d.getDate()}
              </button>
              {items.slice(0, 3).map((o) => {
                const cal = calendarInfo(o.event.calendar);
                const allDay = o.event.allDay;
                return (
                  <button
                    key={o.key}
                    onClick={() => onOpen(o)}
                    className="flex min-w-0 items-center gap-1 truncate rounded px-1 text-left text-[11px] leading-5"
                    style={allDay ? { background: cal.soft, color: cal.color } : undefined}
                  >
                    {!allDay && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: cal.color }} />}
                    {!allDay && <span className="hidden shrink-0 text-muted sm:inline">{timeLabel(o.start)}</span>}
                    <span className="truncate font-medium">{o.event.title}</span>
                  </button>
                );
              })}
              {items.length > 3 && (
                <button onClick={() => onPickDay(d)} className="px-1 text-left text-[11px] font-medium text-muted hover:text-ink">
                  {items.length - 3} more
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
