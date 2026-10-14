// Type an event the way you would say it:
//   "Lunch with Ruth tomorrow 1-2pm"     "School visit Thika fri 10am for 3h #bidii"
//   "every tuesday 7am gym"              "Kesho 9am call Romeo"     "Mum's birthday 24 oct"
//   "Alarm at 6.22"                      "In ten minutes remind me to sleep"
//   "Meeting 3pm remind me 30 minutes before"
// Returns the title, times, repeat and reminder; anything it doesn't
// recognise stays in the title.
import { addDays, addMinutes, startOfDay } from "./dates";
import type { CalendarKind, Repeat } from "./types";

export interface Parsed {
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  repeat: Repeat;
  calendar: CalendarKind | null;
  /** Minutes before the start to remind, if the sentence said; null to use the default. */
  reminders: number[] | null;
  /** What was understood, shown under the box so people trust it. */
  understood: string[];
}

const WEEKDAYS: Record<string, number> = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6,
};
const MONTHS: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4, jun: 5, june: 5,
  jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};
const PARTS_OF_DAY: Record<string, number> = { morning: 9 * 60, noon: 12 * 60, midday: 12 * 60, afternoon: 14 * 60, evening: 18 * 60, tonight: 19 * 60, night: 20 * 60 };
const TAGS: Record<string, CalendarKind> = { personal: "personal", me: "personal", bidii: "bidii", td: "company", trillionaire: "company", company: "company" };

// Numbers people type as words: "in ten minutes", "in an hour".
const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, fifteen: 15, twenty: 20, "twenty five": 25, thirty: 30, forty: 40, "forty five": 45, fifty: 50, half: 0.5,
};
const NUM = `(\\d+(?:\\.\\d+)?|${Object.keys(NUMBER_WORDS).sort((a, b) => b.length - a.length).join("|")})`;
const UNIT = "(minutes?|mins?|m|hours?|hrs?|h)";
const amount = (n: string) => NUMBER_WORDS[n.toLowerCase()] ?? parseFloat(n);
const inMinutes = (n: string, unit: string) => Math.round(amount(n) * (unit.toLowerCase().startsWith("h") ? 60 : 1));

const WD = Object.keys(WEEKDAYS).sort((a, b) => b.length - a.length).join("|");
const MO = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|");

export function parseQuickAdd(input: string, now = new Date()): Parsed {
  let text = ` ${input.trim()} `;
  const understood: string[] = [];
  const take = (re: RegExp): RegExpMatchArray | null => {
    const m = text.match(re);
    if (m) text = text.replace(m[0], " ");
    return m;
  };

  // Calendar tag: #bidii
  let calendar: CalendarKind | null = null;
  const tag = take(/\s#(\w+)/i);
  if (tag && TAGS[tag[1].toLowerCase()]) {
    calendar = TAGS[tag[1].toLowerCase()];
    understood.push(`#${tag[1].toLowerCase()}`);
  }

  // Reminder: "remind me 30 minutes before", "reminder at the start", "no reminder"
  let reminders: number[] | null = null;
  let m = take(new RegExp(`\\s(?:(?:and\\s+)?(?:remind(?:er)?|notify|alert)(?:\\s+me)?\\s+)?${NUM}\\s*${UNIT}\\s+before\\b`, "i"));
  if (m) reminders = [inMinutes(m[1], m[2])];
  else if (take(/\s(?:and\s+)?(?:(?:remind(?:er)?|notify|alert)(?:\s+me)?\s+)?(?:at|on)\s+the\s+(?:start|time)\b/i)) reminders = [0];
  else if (take(/\s(?:with\s+)?no\s+reminders?\b/i)) reminders = [];
  if (reminders) understood.push(reminders.length ? (reminders[0] ? `remind ${reminders[0]} min before` : "remind at the start") : "no reminder");

  // Repeat
  let repeat: Repeat = "none";
  let repeatDay: number | null = null;
  m = take(new RegExp(`\\s(?:every|each)\\s+(${WD})\\b`, "i"));
  if (m) {
    repeat = "weekly";
    repeatDay = WEEKDAYS[m[1].toLowerCase()];
  } else if ((m = take(/\s(?:every\s+weekday|weekdays|mon(?:day)?\s*-\s*fri(?:day)?)\b/i))) repeat = "weekdays";
  else if ((m = take(/\s(?:every\s*day|daily|kila\s+siku)\b/i))) repeat = "daily";
  else if ((m = take(/\s(?:every\s+week|weekly)\b/i))) repeat = "weekly";
  else if ((m = take(/\s(?:every\s+month|monthly)\b/i))) repeat = "monthly";
  else if ((m = take(/\s(?:every\s+year|yearly|annually)\b/i))) repeat = "yearly";
  if (repeat !== "none") understood.push(m![0].trim().toLowerCase());

  // Duration: "for 2h", "for 30 min", "for 1.5 hours"
  let durationMin: number | null = null;
  m = take(new RegExp(`\\sfor\\s+${NUM}\\s*${UNIT}\\b`, "i"));
  if (m) {
    durationMin = inMinutes(m[1], m[2]);
    understood.push(`${durationMin} min`);
  }

  // From now: "in 10 minutes", "in ten minutes", "in an hour", "in half an hour"
  let fromNow: Date | null = null;
  m = take(new RegExp(`\\s(?:in|after)\\s+(?:about\\s+)?${NUM}\\s*(?:an\\s+)?${UNIT}\\b`, "i"));
  if (m) {
    fromNow = addMinutes(now, inMinutes(m[1], m[2]));
    fromNow.setSeconds(0, 0);
  }

  // Time range "1-2pm", "9am-11am", "from 2 to 4pm", "14:00-15:30", "6.30-8pm"
  let startMin: number | null = null;
  let endMin: number | null = null;
  // Minutes may follow a colon or a dot: "6:30" or "6.30".
  const T = String.raw`(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?`;
  // Only a range if it looks like times (has am/pm or minutes), so "24-25" stays text.
  m = text.match(new RegExp(String.raw`\s(?:from\s+)?${T}\s*(?:-|–|to|until|till)\s*${T}(?=\s)`, "i"));
  if (m && (m[3] || m[6] || m[2] || m[5])) {
    text = text.replace(m[0], " ");
    const endMer = m[6]?.toLowerCase();
    const startMer = m[3]?.toLowerCase() ?? (endMer && Number(m[1]) <= Number(m[4]) ? endMer : undefined);
    startMin = toMinutes(Number(m[1]), Number(m[2] ?? 0), startMer);
    endMin = toMinutes(Number(m[4]), Number(m[5] ?? 0), endMer);
    if (endMin <= startMin) endMin += 12 * 60;
  } else {
    m =
      take(new RegExp(String.raw`\s(?:at\s+|@\s*)?(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)(?=\s)`, "i")) ??
      take(/\s(?:at\s+|@\s*)?(\d{1,2})[:.](\d{2})(?=\s)/i) ??
      take(/\sat\s+(\d{1,2})(?=\s)/i);
    if (m) startMin = toMinutes(Number(m[1]), Number(m[2] ?? 0), m[3]?.toLowerCase());
  }
  if (startMin === null && !fromNow) {
    const part = take(new RegExp(`\\s(?:in\\s+the\\s+|this\\s+)?(${Object.keys(PARTS_OF_DAY).join("|")})\\b`, "i"));
    if (part) startMin = PARTS_OF_DAY[part[1].toLowerCase()];
  }

  // Date
  let day: Date | null = null;
  const today = startOfDay(now);
  if (take(/\s(?:day\s+after\s+tomorrow|kesho\s+kutwa)\b/i)) day = addDays(today, 2);
  else if (take(/\s(?:tomorrow|tmrw|tmr|kesho)\b/i)) day = addDays(today, 1);
  else if (take(/\s(?:today|leo)\b/i)) day = today;
  else if ((m = take(new RegExp(`\\s(next\\s+)?(?:on\\s+)?(${WD})\\b`, "i")))) {
    const target = WEEKDAYS[m[2].toLowerCase()];
    let diff = (target - today.getDay() + 7) % 7;
    if (m[1] && diff === 0) diff = 7; // "next friday" on a Friday means a week away
    day = addDays(today, diff);
  } else if ((m = take(new RegExp(String.raw`\s(?:on\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+(${MO})\b(?:\s+(\d{4}))?`, "i")))) {
    day = futureDate(today, Number(m[1]), MONTHS[m[2].toLowerCase()], m[3]);
  } else if ((m = take(new RegExp(String.raw`\s(?:on\s+)?(${MO})\s+(\d{1,2})(?:st|nd|rd|th)?\b(?:,?\s+(\d{4}))?`, "i")))) {
    day = futureDate(today, Number(m[2]), MONTHS[m[1].toLowerCase()], m[3]);
  } else if ((m = take(/\s(?:on\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?=\s)/))) {
    day = futureDate(today, Number(m[1]), Number(m[2]) - 1, m[3]); // Kenyan order: day/month
  }

  if (repeatDay !== null && !day) {
    day = addDays(today, (repeatDay - today.getDay() + 7) % 7);
  }

  // "in ten minutes" with no other time: that exact moment.
  if (fromNow && startMin === null && !day) {
    day = startOfDay(fromNow);
    startMin = fromNow.getHours() * 60 + fromNow.getMinutes();
  }

  const allDay = startMin === null;
  if (!day) {
    // A time with no date means the next time it comes round.
    day = today;
    if (startMin !== null && startMin < now.getHours() * 60 + now.getMinutes()) day = addDays(today, 1);
  }
  if (repeatDay !== null && day.getDay() !== repeatDay) day = addDays(day, (repeatDay - day.getDay() + 7) % 7);

  let start: Date;
  let end: Date;
  if (allDay) {
    start = day;
    end = addDays(day, 1);
  } else {
    start = addMinutes(day, startMin!);
    end = endMin !== null ? addMinutes(day, endMin) : addMinutes(start, durationMin ?? (fromNow ? 15 : 60));
  }

  if (day.getTime() !== today.getTime() || !allDay) understood.unshift(describe(start, end, allDay, now));

  const title = text
    // "remind me to sleep" is about sleeping.
    .replace(/\s(?:please\s+)?(?:remind|notify|alert|tell)\s+me(?:\s+to)?(?=\s)/gi, " ")
    .replace(/\s(?:set\s+)?(?:an?\s+)?alarm(?:\s+(?:for|to))?(?=\s)/gi, " Alarm ")
    .replace(/\s(?:at|on|from|in|the|and)(?=\s*$)/gi, " ")
    .replace(/^\s*(?:at|on)\s/i, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[,\-–]+$/, "")
    .trim();

  const clean = title ? title.charAt(0).toUpperCase() + title.slice(1) : "Untitled";
  return { title: clean, start, end, allDay, repeat, calendar, reminders, understood };
}

function toMinutes(h: number, min: number, mer?: string): number {
  if (mer === "am") return (h % 12) * 60 + min;
  if (mer === "pm") return ((h % 12) + 12) * 60 + min;
  if (h >= 13) return h * 60 + min; // 24-hour clock
  // A bare hour: 1–7 is the afternoon in everyday speech, 8–11 the morning.
  return (h >= 1 && h <= 7 ? h + 12 : h % 24) * 60 + min;
}

function futureDate(today: Date, d: number, month: number, year?: string): Date {
  if (year) return new Date(year.length === 2 ? 2000 + Number(year) : Number(year), month, d);
  const candidate = new Date(today.getFullYear(), month, d);
  return candidate < today ? new Date(today.getFullYear() + 1, month, d) : candidate;
}

function describe(start: Date, end: Date, allDay: boolean, now: Date): string {
  const day = start.toLocaleDateString("en-KE", { weekday: "short", day: "numeric", month: "short", ...(start.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) });
  if (allDay) return `${day}, all day`;
  const t = (d: Date) => d.toLocaleTimeString("en-KE", { hour: "numeric", minute: "2-digit" });
  return `${day}, ${t(start)}–${t(end)}`;
}

/**
 * The reminders a new event gets when nobody chose: at the start, and also
 * 10 minutes before when there is still time for that.
 */
export function defaultReminders(start: Date, allDay: boolean, now = new Date()): number[] {
  if (allDay) return [];
  return start.getTime() - now.getTime() > 15 * 60_000 ? [10, 0] : [0];
}
