export function kes(n: number) {
  const sign = n < 0 ? "−" : "";
  return `${sign}KES ${Math.abs(Math.round(n)).toLocaleString("en-KE")}`;
}

// Dates are stored as YYYY-MM-DD and shown in Nairobi time.
const TZ = "Africa/Nairobi";

// A plain date (YYYY-MM-DD) is that day; a full timestamp is shown as the
// Nairobi day it happened on (1am Nairobi is still "today", not yesterday).
const asInstant = (iso: string) => new Date(iso.length > 10 ? iso : `${iso}T12:00:00Z`);

export function shortDate(iso: string) {
  return asInstant(iso).toLocaleDateString("en-KE", { day: "numeric", month: "short", timeZone: TZ });
}

export function longDate(iso: string) {
  return asInstant(iso).toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric", timeZone: TZ });
}

export function todayIso() {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}

/** "October 2026" for a YYYY-MM-DD date, whatever the server's time zone. */
export function monthLabel(iso: string) {
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-KE", { month: "long", year: "numeric", timeZone: TZ });
}

/** First and last day of the month containing a YYYY-MM-DD date. */
export function monthBounds(iso: string) {
  const [y, m] = iso.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  return { start: `${y}-${mm}-01`, end: `${y}-${mm}-${String(last).padStart(2, "0")}` };
}

export function daysUntil(iso: string, today = todayIso()) {
  return Math.round((Date.parse(iso.slice(0, 10)) - Date.parse(today)) / 86_400_000);
}
