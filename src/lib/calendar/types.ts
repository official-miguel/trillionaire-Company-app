/**
 * A calendar is either "personal" (private to its owner) or a company's
 * calendar, named by that company's ledger id ("company" for Trillionaire
 * Designs, "bidii", and later each new app). People see only the company
 * calendars of the companies they are in.
 */
export type CalendarKind = string;

export interface CalendarInfo {
  label: string;
  color: string;
  soft: string;
  shared: boolean;
}

const KNOWN: Record<string, CalendarInfo> = {
  personal: { label: "Personal", color: "#7c5cff", soft: "#f1edff", shared: false },
  bidii: { label: "Bidii", color: "#28a428", soft: "#ecfbe9", shared: true },
  company: { label: "Trillionaire Designs", color: "#0a0a0a", soft: "#f0f0f0", shared: true },
};

// Colours for apps added later, given in order.
const SPARE = [
  { color: "#2e6bff", soft: "#eaf0ff" },
  { color: "#ff3ea5", soft: "#ffeaf5" },
  { color: "#ffb020", soft: "#fff6e3" },
  { color: "#00c2d1", soft: "#e3fafc" },
];

export function calendarInfo(kind: CalendarKind, names: Record<string, string> = {}): CalendarInfo {
  if (KNOWN[kind]) return KNOWN[kind];
  const spare = SPARE[[...kind].reduce((a, c) => a + c.charCodeAt(0), 0) % SPARE.length];
  return { label: names[kind] ?? kind, ...spare, shared: true };
}

/** The calendars a person may use: Personal plus their companies' calendars. */
export function calendarsFor(ledgers: string[]): CalendarKind[] {
  return ["personal", ...ledgers.filter((l) => l !== "personal")];
}

export type Repeat = "none" | "daily" | "weekdays" | "weekly" | "monthly" | "yearly";

export interface CalEvent {
  id: string;
  ownerId: string;
  title: string;
  start: string; // ISO, UTC
  end: string; // ISO, UTC
  allDay: boolean;
  calendar: CalendarKind;
  location: string;
  notes: string;
  repeat: Repeat;
  repeatUntil: string | null; // ISO date
  /** Minutes before the start to remind; empty for none. */
  reminders: number[];
  /** People invited (ids); only for company calendars. */
  invitees: string[];
  updatedAt: string;
  deletedAt: string | null;
}

export interface Todo {
  id: string;
  ownerId: string;
  title: string;
  /** Who gave this task, if someone with the task permission did; null for your own to-dos. */
  assignedBy: string | null;
  /** The company the task is for (null for a personal to-do). */
  ledgerId: string | null;
  /** Planned slot, if it has been put on the calendar. */
  scheduledStart: string | null;
  durationMin: number;
  dueOn: string | null; // YYYY-MM-DD
  doneAt: string | null;
  updatedAt: string;
  deletedAt: string | null;
}

/** One showing of an event; repeating events have many. */
export interface Occurrence {
  event: CalEvent;
  start: Date;
  end: Date;
  key: string;
}
