"use client";

import { dayKey, sameDay, timeLabel } from "@/lib/calendar/dates";
import { calendarInfo, type Occurrence } from "@/lib/calendar/types";

export function Agenda({ occurrences, onOpen }: { occurrences: Occurrence[]; onOpen: (o: Occurrence) => void }) {
  const groups = new Map<string, Occurrence[]>();
  for (const o of occurrences) {
    const k = dayKey(o.start);
    groups.set(k, [...(groups.get(k) ?? []), o]);
  }
  const today = new Date();

  if (occurrences.length === 0) {
    return <p className="m-6 rounded-2xl bg-surface px-4 py-8 text-center text-sm text-muted">Nothing planned for the next 30 days. Type something in the box above to add it.</p>;
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3 sm:px-4">
      {[...groups.entries()].map(([k, items]) => {
        const d = items[0].start;
        return (
          <section key={k} className="flex gap-4 border-b border-line py-3 last:border-0">
            <div className="w-14 shrink-0 text-center">
              <p className={`text-[11px] uppercase tracking-wide ${sameDay(d, today) ? "text-lime-deep" : "text-muted"}`}>{d.toLocaleDateString("en-KE", { weekday: "short" })}</p>
              <p className={`mx-auto mt-0.5 flex h-9 w-9 items-center justify-center rounded-full text-lg font-semibold ${sameDay(d, today) ? "bg-lime" : ""}`}>{d.getDate()}</p>
            </div>
            <ul className="flex min-w-0 flex-1 flex-col gap-1.5">
              {items.map((o) => {
                const cal = calendarInfo(o.event.calendar);
                return (
                  <li key={o.key}>
                    <button onClick={() => onOpen(o)} className="flex w-full items-start gap-3 rounded-xl px-2 py-1.5 text-left hover:bg-surface">
                      <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: cal.color }} />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{o.event.title}</span>
                        <span className="block truncate text-sm text-muted">
                          {o.event.allDay ? "All day" : `${timeLabel(o.start)} – ${timeLabel(o.end)}`}
                          {o.event.location ? ` · ${o.event.location}` : ""}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
