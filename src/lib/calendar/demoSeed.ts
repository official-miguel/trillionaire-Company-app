// Sample events for demo mode, placed around today so the calendar looks lived in.
import { addDays, startOfDay, startOfWeek } from "./dates";
import type { CalEvent } from "./types";

export function demoSeed(ownerId: string, people: { id: string }[], calendars: string[]): CalEvent[] {
  const today = startOfDay(new Date());
  const week = startOfWeek(today);
  const at = (d: Date, h: number, m = 0) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m).toISOString();
  const others = people.map((p) => p.id).filter((id) => id !== ownerId);
  const base: Omit<CalEvent, "id" | "title" | "calendar" | "start" | "end"> = {
    ownerId,
    location: "",
    notes: "",
    repeat: "none",
    repeatUntil: null,
    reminders: [10],
    invitees: [],
    updatedAt: "",
    deletedAt: null,
    allDay: false,
  };

  const all: CalEvent[] = [
    { ...base, id: crypto.randomUUID(), title: "Gym", calendar: "personal", start: at(week, 6, 30), end: at(week, 7, 30), repeat: "weekdays" },
    { ...base, id: crypto.randomUUID(), title: "Team check-in", calendar: "bidii", start: at(addDays(week, 0), 9), end: at(addDays(week, 0), 9, 30), repeat: "weekly", invitees: others },
    { ...base, id: crypto.randomUUID(), title: "School visit: Thika Road Primary", calendar: "bidii", location: "Thika", start: at(addDays(today, 1), 10), end: at(addDays(today, 1), 13), invitees: others.slice(0, 2) },
    { ...base, id: crypto.randomUUID(), title: "Demo for Kiambu Hills", calendar: "bidii", location: "Kiambu", start: at(addDays(today, 1), 11), end: at(addDays(today, 1), 12) },
    { ...base, id: crypto.randomUUID(), title: "Lunch with Ruth", calendar: "personal", start: at(today, 13), end: at(today, 14) },
    { ...base, id: crypto.randomUUID(), title: "Call Romeo (finance)", calendar: "company", start: at(today, 16), end: at(today, 16, 45) },
    { ...base, id: crypto.randomUUID(), title: "Close the month", calendar: "company", start: at(addDays(today, 3), 9), end: at(addDays(today, 3), 11) },
    { ...base, id: crypto.randomUUID(), title: "Church", calendar: "personal", start: at(addDays(week, 6), 9), end: at(addDays(week, 6), 11, 30), repeat: "weekly" },
    { ...base, id: crypto.randomUUID(), title: "Mashujaa Day", calendar: "personal", allDay: true, start: at(new Date(today.getFullYear(), 9, 20), 0), end: at(new Date(today.getFullYear(), 9, 21), 0), repeat: "yearly", reminders: [] },
  ];
  // Only calendars this person may see, e.g. no Trillionaire Designs events for a Bidii-only member.
  return all.filter((e) => calendars.includes(e.calendar));
}
