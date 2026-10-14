import { describe, expect, it } from "vitest";
import { defaultReminders, parseQuickAdd } from "./quickAdd";
import { occurrences } from "./recurrence";
import { placeDay } from "./layout";
import { monthGrid, startOfWeek } from "./dates";
import { nextFreeSlot } from "./plan";
import type { CalEvent } from "./types";

// Wednesday 14 October 2026, 10:00 local time
const NOW = new Date(2026, 9, 14, 10, 0);
const at = (d: number, h: number, min = 0, month = 9) => new Date(2026, month, d, h, min).getTime();

describe("quick add", () => {
  it("reads a day and a time range", () => {
    const p = parseQuickAdd("Lunch with Ruth tomorrow 1-2pm", NOW);
    expect(p.title).toBe("Lunch with Ruth");
    expect(p.start.getTime()).toBe(at(15, 13));
    expect(p.end.getTime()).toBe(at(15, 14));
    expect(p.allDay).toBe(false);
  });

  it("reads a weekday, a time, a duration and a calendar tag", () => {
    const p = parseQuickAdd("School visit Thika fri 10am for 3h #bidii", NOW);
    expect(p.title).toBe("School visit Thika");
    expect(p.start.getTime()).toBe(at(16, 10));
    expect(p.end.getTime()).toBe(at(16, 13));
    expect(p.calendar).toBe("bidii");
  });

  it("understands Swahili for today and tomorrow", () => {
    expect(parseQuickAdd("Kesho 9am call Romeo", NOW).start.getTime()).toBe(at(15, 9));
    expect(parseQuickAdd("Kesho 9am call Romeo", NOW).title).toBe("Call Romeo");
    expect(parseQuickAdd("leo 4pm gym", NOW).start.getTime()).toBe(at(14, 16));
  });

  it("makes a dated event with no time an all-day event", () => {
    const p = parseQuickAdd("Mum's birthday 24 oct", NOW);
    expect(p.title).toBe("Mum's birthday");
    expect(p.allDay).toBe(true);
    expect(p.start.getTime()).toBe(at(24, 0));
  });

  it("moves a past date to next year", () => {
    expect(parseQuickAdd("Anniversary 3 march", NOW).start.getFullYear()).toBe(2027);
  });

  it("reads repeats", () => {
    const p = parseQuickAdd("every tuesday 7am gym", NOW);
    expect(p.repeat).toBe("weekly");
    expect(p.title).toBe("Gym");
    expect(p.start.getDay()).toBe(2);
    expect(p.start.getTime()).toBe(at(20, 7));
    expect(parseQuickAdd("standup weekdays 9:30am", NOW).repeat).toBe("weekdays");
  });

  it("puts a time that has already passed today on tomorrow", () => {
    expect(parseQuickAdd("Call bank 8am", NOW).start.getTime()).toBe(at(15, 8));
  });

  it("treats a bare 3 as the afternoon and 9 as the morning", () => {
    expect(parseQuickAdd("Meet at 3 tomorrow", NOW).start.getHours()).toBe(15);
    expect(parseQuickAdd("Meet at 9 tomorrow", NOW).start.getHours()).toBe(9);
  });

  it("reads 24-hour times and parts of the day", () => {
    expect(parseQuickAdd("Board call 14:30 tomorrow", NOW).start.getTime()).toBe(at(15, 14, 30));
    expect(parseQuickAdd("Read tomorrow evening", NOW).start.getHours()).toBe(18);
  });

  it("reads day/month dates in Kenyan order", () => {
    expect(parseQuickAdd("Rent due 5/11", NOW).start.getTime()).toBe(at(5, 0, 0, 10));
  });

  it("keeps plain text as the title", () => {
    const p = parseQuickAdd("Think about pricing", NOW);
    expect(p.title).toBe("Think about pricing");
    expect(p.allDay).toBe(true);
  });
});

describe("quick add: what people really type", () => {
  // Wednesday 14 October 2026, 18:15 — the sentences from the first real test.
  const EVE = new Date(2026, 9, 14, 18, 15);

  it.each([
    ["I am going to juja at 6.17 pm", "I am going to juja", 18, 17],
    ["Alarm at 6.22", "Alarm", 18, 22],
    ["Add test 2 at 6.25 pm", "Add test 2", 18, 25],
    ["Alarm at 6.20", "Alarm", 18, 20],
    ["Board call 18.30", "Board call", 18, 30],
  ])("reads dotted times: %s", (text, title, h, min) => {
    const p = parseQuickAdd(text, EVE);
    expect(p.title).toBe(title);
    expect(p.allDay).toBe(false);
    expect([p.start.getDate(), p.start.getHours(), p.start.getMinutes()]).toEqual([14, h, min]);
  });

  it("reads 'in ten minutes' and takes 'notify me to' out of the title", () => {
    const p = parseQuickAdd("In ten minutes notify me to sleep", EVE);
    expect(p.title).toBe("Sleep");
    expect([p.start.getHours(), p.start.getMinutes()]).toEqual([18, 25]);
    expect(parseQuickAdd("call mum in 2 hours", EVE).start.getHours()).toBe(20);
    expect(parseQuickAdd("Stretch in half an hour", EVE).start.getMinutes()).toBe(45);
  });

  it("reads the reminder from the sentence", () => {
    expect(parseQuickAdd("Add test 2 at 6.25 reminder at the start", EVE)).toMatchObject({ title: "Add test 2", reminders: [0] });
    expect(parseQuickAdd("Meeting 9pm remind me 30 minutes before", EVE)).toMatchObject({ title: "Meeting", reminders: [30] });
    expect(parseQuickAdd("Quiet time 9pm no reminder", EVE).reminders).toEqual([]);
    expect(parseQuickAdd("Dinner 8pm", EVE).reminders).toBeNull();
  });

  it("keeps 'set an alarm for' simple", () => {
    expect(parseQuickAdd("set an alarm for 6.40", EVE)).toMatchObject({ title: "Alarm", allDay: false });
  });

  it("reminds at the start for something soon, and 10 minutes before too when there is time", () => {
    expect(defaultReminders(new Date(2026, 9, 14, 18, 22), false, EVE)).toEqual([0]);
    expect(defaultReminders(new Date(2026, 9, 14, 19, 0), false, EVE)).toEqual([10, 0]);
    expect(defaultReminders(new Date(2026, 9, 15), true, EVE)).toEqual([]);
  });
});

const event = (over: Partial<CalEvent>): CalEvent => ({
  id: "e1",
  ownerId: "me",
  title: "x",
  start: new Date(2026, 9, 12, 9).toISOString(),
  end: new Date(2026, 9, 12, 10).toISOString(),
  allDay: false,
  calendar: "personal",
  location: "",
  notes: "",
  repeat: "none",
  repeatUntil: null,
  reminders: [],
  invitees: [],
  updatedAt: "",
  deletedAt: null,
  ...over,
});

describe("repeating events", () => {
  const week = [new Date(2026, 9, 12), new Date(2026, 9, 19)] as const;

  it("shows a weekday repeat Monday to Friday only", () => {
    const occ = occurrences([event({ repeat: "weekdays" })], ...week);
    expect(occ.map((o) => o.start.getDate())).toEqual([12, 13, 14, 15, 16]);
  });

  it("stops at the repeat-until date", () => {
    const occ = occurrences([event({ repeat: "daily", repeatUntil: "2026-10-14" })], ...week);
    expect(occ).toHaveLength(3);
  });

  it("finds a weekly repeat that started long ago", () => {
    const occ = occurrences([event({ repeat: "weekly", start: new Date(2024, 0, 1, 9).toISOString(), end: new Date(2024, 0, 1, 10).toISOString() })], ...week);
    expect(occ.map((o) => o.start.getDate())).toEqual([12]);
  });

  it("keeps the last day for a monthly repeat on the 31st", () => {
    const occ = occurrences([event({ repeat: "monthly", start: new Date(2026, 0, 31, 9).toISOString(), end: new Date(2026, 0, 31, 10).toISOString() })], new Date(2026, 1, 1), new Date(2026, 3, 1));
    expect(occ.map((o) => `${o.start.getMonth() + 1}/${o.start.getDate()}`)).toEqual(["2/28", "3/31"]);
  });

  it("hides deleted events", () => {
    expect(occurrences([event({ deletedAt: "2026-10-01" })], ...week)).toHaveLength(0);
  });
});

describe("day layout", () => {
  it("puts overlapping events side by side and lone ones full width", () => {
    const mk = (id: string, s: number, e: number) => ({ event: event({ id }), start: new Date(2026, 9, 14, s), end: new Date(2026, 9, 14, e), key: id });
    const placed = placeDay([mk("a", 9, 11), mk("b", 10, 12), mk("c", 13, 14)]);
    const by = Object.fromEntries(placed.map((p) => [p.occ.key, [p.col, p.cols]]));
    expect(by).toEqual({ a: [0, 2], b: [1, 2], c: [0, 1] });
  });
});

describe("plan my day", () => {
  const b = (s: number, e: number, day = 14) => ({ start: new Date(2026, 9, day, s), end: new Date(2026, 9, day, e) });

  it("uses the next gap that fits, rounded to 15 minutes", () => {
    const from = new Date(2026, 9, 14, 9, 5);
    expect(nextFreeSlot([b(9, 10), b(10, 12)], 60, from)?.getTime()).toBe(at(14, 12));
    expect(nextFreeSlot([b(10, 12)], 30, from)?.getTime()).toBe(at(14, 9, 15));
  });

  it("skips a gap that is too short", () => {
    expect(nextFreeSlot([b(9, 10), b(10, 30 / 60 + 10)], 60, new Date(2026, 9, 14, 9))).not.toBeNull();
    const busy = [b(9, 10), { start: new Date(2026, 9, 14, 10, 30), end: new Date(2026, 9, 14, 12) }];
    expect(nextFreeSlot(busy, 60, new Date(2026, 9, 14, 9))?.getTime()).toBe(at(14, 12));
  });

  it("moves to tomorrow morning when today is full", () => {
    expect(nextFreeSlot([b(7, 21)], 60, new Date(2026, 9, 14, 8))?.getTime()).toBe(at(15, 7));
    expect(nextFreeSlot([], 60, new Date(2026, 9, 14, 20, 30))?.getTime()).toBe(at(15, 7));
  });
});

describe("dates", () => {
  it("starts weeks on Monday and shows six weeks a month", () => {
    expect(startOfWeek(NOW).getDate()).toBe(12);
    const grid = monthGrid(NOW);
    expect(grid).toHaveLength(42);
    expect(grid[0].getDate()).toBe(28); // Mon 28 Sep 2026
  });
});
