// "Plan my day": puts a to-do in the next free gap, between what is already
// on the calendar, inside working hours.

export interface Busy {
  start: Date;
  end: Date;
}

export interface PlanOptions {
  dayStartHour?: number; // default 7
  dayEndHour?: number; // default 21
  stepMin?: number; // round starts to this, default 15
  maxDaysAhead?: number; // default 7
}

export function nextFreeSlot(busy: Busy[], durationMin: number, from: Date, opts: PlanOptions = {}): Date | null {
  const { dayStartHour = 7, dayEndHour = 21, stepMin = 15, maxDaysAhead = 7 } = opts;
  const sorted = [...busy].sort((a, b) => a.start.getTime() - b.start.getTime());
  const len = durationMin * 60_000;

  for (let d = 0; d <= maxDaysAhead; d++) {
    const day = new Date(from.getFullYear(), from.getMonth(), from.getDate() + d);
    const open = new Date(day.getFullYear(), day.getMonth(), day.getDate(), dayStartHour);
    const close = new Date(day.getFullYear(), day.getMonth(), day.getDate(), dayEndHour);
    let t = d === 0 ? new Date(Math.max(open.getTime(), roundUp(from, stepMin).getTime())) : open;

    for (const b of sorted) {
      if (b.end <= t || b.start >= close) continue;
      if (b.start.getTime() - t.getTime() >= len) break;
      if (b.end > t) t = roundUp(b.end, stepMin);
    }
    if (close.getTime() - t.getTime() >= len) return t;
  }
  return null;
}

function roundUp(d: Date, stepMin: number): Date {
  const step = stepMin * 60_000;
  return new Date(Math.ceil(d.getTime() / step) * step);
}
