import { addDays, addMonths } from "./dates";
import type { CalEvent, Occurrence } from "./types";

/** Every showing of the events between `from` and `to`, sorted by start. */
export function occurrences(events: CalEvent[], from: Date, to: Date): Occurrence[] {
  const out: Occurrence[] = [];
  for (const e of events) {
    if (e.deletedAt) continue;
    const start = new Date(e.start);
    const length = new Date(e.end).getTime() - start.getTime();
    const until = e.repeatUntil ? new Date(`${e.repeatUntil}T23:59:59`) : null;

    if (e.repeat === "none") {
      const end = new Date(start.getTime() + length);
      if (end > from && start < to) out.push({ event: e, start, end, key: `${e.id}:${start.toISOString()}` });
      continue;
    }

    let n = 0;
    let cur = start;
    // Jump close to the range so long-running repeats stay fast.
    if (e.repeat === "daily" || e.repeat === "weekly") {
      const step = e.repeat === "daily" ? 1 : 7;
      const skip = Math.max(0, Math.floor((from.getTime() - start.getTime() - length) / (step * 86_400_000)) - 1);
      n = skip;
      cur = addDays(start, skip * step);
    }
    for (let guard = 0; guard < 2000 && cur < to; guard++) {
      if (until && cur > until) break;
      const end = new Date(cur.getTime() + length);
      const weekday = cur.getDay();
      const skipWeekend = e.repeat === "weekdays" && (weekday === 0 || weekday === 6);
      if (!skipWeekend && end > from) out.push({ event: e, start: cur, end, key: `${e.id}:${cur.toISOString()}` });
      n++;
      cur = next(start, e.repeat, n, cur);
    }
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime() || b.end.getTime() - a.end.getTime());
}

function next(start: Date, repeat: CalEvent["repeat"], n: number, cur: Date): Date {
  switch (repeat) {
    case "daily":
    case "weekdays":
      return addDays(cur, 1);
    case "weekly":
      return addDays(start, 7 * n);
    case "monthly":
      return addMonths(start, n);
    case "yearly":
      return addMonths(start, 12 * n);
    default:
      return new Date(8.64e15);
  }
}

export const REPEAT_LABELS: Record<CalEvent["repeat"], string> = {
  none: "Does not repeat",
  daily: "Every day",
  weekdays: "Every weekday (Mon–Fri)",
  weekly: "Every week",
  monthly: "Every month",
  yearly: "Every year",
};
