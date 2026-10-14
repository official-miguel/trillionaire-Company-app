import { readFileSync, writeFileSync } from "node:fs";
const f = "src/lib/calendar/quickAdd.ts";
let s = readFileSync(f, "utf8");
const rep = (a, b) => { const p = s.split(a); if (p.length !== 2) throw new Error("miss: " + a.slice(0, 60)); s = p.join(b); };

rep(`// Type an event the way you would say it:
//   "Lunch with Ruth tomorrow 1-2pm"     "School visit Thika fri 10am for 3h #bidii"
//   "every tuesday 7am gym"              "Kesho 9am call Romeo"     "Mum's birthday 24 oct"
// Returns the title, times and repeat; anything it doesn't recognise stays in the title.`,
`// Type an event the way you would say it:
//   "Lunch with Ruth tomorrow 1-2pm"     "School visit Thika fri 10am for 3h #bidii"
//   "every tuesday 7am gym"              "Kesho 9am call Romeo"     "Mum's birthday 24 oct"
//   "Alarm at 6.22"                      "In ten minutes remind me to sleep"
//   "Meeting 3pm remind me 30 minutes before"
// Returns the title, times, repeat and reminder; anything it doesn't
// recognise stays in the title.`);

rep(`  calendar: CalendarKind | null;
  /** What was understood, shown under the box so people trust it. */`,
`  calendar: CalendarKind | null;
  /** Minutes before the start to remind, if the sentence said; null to use the default. */
  reminders: number[] | null;
  /** What was understood, shown under the box so people trust it. */`);

rep(`const WD = Object.keys(WEEKDAYS)`,
`// Numbers people type as words: "in ten minutes", "in an hour".
const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, fifteen: 15, twenty: 20, "twenty five": 25, thirty: 30, "forty five": 45, forty: 40, fifty: 50, half: 0.5,
};
const NUM = String.raw\`(\d+(?:\.\d+)?|\${Object.keys(NUMBER_WORDS).sort((a, b) => b.length - a.length).join("|")})\`;
const UNIT = String.raw\`(minutes?|mins?|m|hours?|hrs?|h)\`;
const amount = (n: string) => NUMBER_WORDS[n.toLowerCase()] ?? parseFloat(n);
const inMinutes = (n: string, unit: string) => Math.round(amount(n) * (unit.toLowerCase().startsWith("h") ? 60 : 1));

const WD = Object.keys(WEEKDAYS)`);

rep(`  // Repeat
  let repeat: Repeat = "none";`,
`  // Reminder: "remind me 30 minutes before", "reminder at the start", "no reminder"
  let reminders: number[] | null = null;
  let r = take(new RegExp(String.raw\`\s(?:(?:and\s+)?(?:remind(?:er)?|notify|alert)(?:\s+me)?\s+)?\${NUM}\s*\${UNIT}\s+before\b\`, "i"));
  if (r) reminders = [inMinutes(r[1], r[2])];
  else if ((r = take(/\s(?:and\s+)?(?:(?:remind(?:er)?|notify|alert)(?:\s+me)?\s+)?(?:at|on)\s+the\s+(?:start|time)\b/i))) reminders = [0];
  else if ((r = take(/\s(?:with\s+)?no\s+reminders?\b/i))) reminders = [];
  if (reminders) understood.push(reminders.length ? (reminders[0] ? \`remind \${reminders[0]} min before\` : "remind at the start") : "no reminder");

  // Repeat
  let repeat: Repeat = "none";`);

rep(`  // Time range "1-2pm", "9am-11am", "from 2 to 4pm", "14:00-15:30"
  let startMin: number | null = null;
  let endMin: number | null = null;
  const T = String.raw\`(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\`;`,
`  // From now: "in 10 minutes", "in ten minutes", "in an hour", "in half an hour"
  let fromNow: Date | null = null;
  r = take(new RegExp(String.raw\`\s(?:in|after)\s+(?:about\s+)?\${NUM}\s*(?:an\s+)?\${UNIT}\b\`, "i"));
  if (r) {
    fromNow = addMinutes(now, inMinutes(r[1], r[2]));
    fromNow.setSeconds(0, 0);
  }

  // Time range "1-2pm", "9am-11am", "from 2 to 4pm", "14:00-15:30", "6.30-8pm"
  let startMin: number | null = null;
  let endMin: number | null = null;
  // Minutes may follow a colon or a dot: "6:30" or "6.30".
  const T = String.raw\`(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?\`;`);

rep(`    m = take(new RegExp(String.raw\`\s(?:at\s+|@\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)(?=\s)\`, "i")) ?? take(/\s(?:at\s+|@\s*)?(\d{1,2}):(\d{2})(?=\s)/i) ?? take(/\sat\s+(\d{1,2})(?=\s)/i);`,
    `    m = take(new RegExp(String.raw\`\s(?:at\s+|@\s*)?(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)(?=\s)\`, "i")) ?? take(/\s(?:at\s+|@\s*)?(\d{1,2})[:.](\d{2})(?=\s)/i) ?? take(/\sat\s+(\d{1,2})(?=\s)/i);`);

rep(`  const allDay = startMin === null;`, `  if (fromNow && startMin === null && !day) {
    day = startOfDay(fromNow);
    startMin = fromNow.getHours() * 60 + fromNow.getMinutes();
  }
  const allDay = startMin === null;`);

rep(`  const title = text
    .replace(/\s(?:at|on|from|in|the)(?=\s*$)/gi, " ")`,
`  const title = text
    // "remind me to sleep" is about sleeping.
    .replace(/\s(?:please\s+)?(?:remind|notify|alert|tell)\s+me(?:\s+to)?(?=\s)/gi, " ")
    .replace(/\s(?:set\s+)?(?:an?\s+)?(alarm)(?:\s+(?:for|to))?(?=\s)/gi, " Alarm ")
    .replace(/\s(?:at|on|from|in|the|and)(?=\s*$)/gi, " ")`);

rep(`  return { title: title || "Untitled", start, end, allDay, repeat, calendar, understood };`,
`  const clean = title ? title.charAt(0).toUpperCase() + title.slice(1) : "Untitled";
  return { title: clean, start, end, allDay, repeat, calendar, reminders, understood };`);

writeFileSync(f, s);
console.log("ok");
