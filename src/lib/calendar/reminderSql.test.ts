// Runs the database's reminder helpers in a real Postgres (PGlite, in memory)
// and checks them against the app's own repeat rules.
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(readFileSync("supabase/migrations/0005_reminder_helpers.sql", "utf8"));
});

async function starts(start: string, end: string, repeat: string, until: string | null, tz: string, from: string, to: string) {
  const r = await db.query<{ s: string }>(
    `select to_char(s at time zone $5, 'YYYY-MM-DD HH24:MI Dy') as s
       from public.event_occurrence_starts($1::timestamptz, $2::timestamptz, $3, $4::date, $5, $6::timestamptz, $7::timestamptz) s`,
    [start, end, repeat, until, tz, from, to],
  );
  return r.rows.map((x) => x.s);
}

const NBO = "Africa/Nairobi";

describe("reminders scheduled in the database", () => {
  it("finds a one-off event only when it is in range", async () => {
    expect(await starts("2026-10-15 09:00+03", "2026-10-15 10:00+03", "none", null, NBO, "2026-10-14", "2026-10-20")).toEqual(["2026-10-15 09:00 Thu"]);
    expect(await starts("2026-10-15 09:00+03", "2026-10-15 10:00+03", "none", null, NBO, "2026-10-16", "2026-10-20")).toEqual([]);
  });

  it("repeats on weekdays only", async () => {
    expect(await starts("2026-10-12 06:30+03", "2026-10-12 07:30+03", "weekdays", null, NBO, "2026-10-12", "2026-10-19")).toEqual([
      "2026-10-12 06:30 Mon",
      "2026-10-13 06:30 Tue",
      "2026-10-14 06:30 Wed",
      "2026-10-15 06:30 Thu",
      "2026-10-16 06:30 Fri",
    ]);
  });

  it("finds a weekly event that started years ago, quickly", async () => {
    expect(await starts("2024-01-01 09:00+03", "2024-01-01 10:00+03", "weekly", null, NBO, "2026-10-12", "2026-10-19")).toEqual(["2026-10-12 09:00 Mon"]);
  });

  it("stops after the repeat-until day, including that day", async () => {
    expect(await starts("2026-10-12 09:00+03", "2026-10-12 10:00+03", "daily", "2026-10-14", NBO, "2026-10-12", "2026-10-30")).toHaveLength(3);
  });

  it("keeps a monthly event on the 31st, or the last day of shorter months", async () => {
    expect(await starts("2026-01-31 09:00+03", "2026-01-31 10:00+03", "monthly", null, NBO, "2026-02-01", "2026-04-01")).toEqual([
      "2026-02-28 09:00 Sat",
      "2026-03-31 09:00 Tue",
    ]);
  });

  it("keeps the clock time across daylight saving for someone in the US", async () => {
    // Romeo's weekly 9am call: 9am before and after the clocks change on 8 March 2026.
    expect(await starts("2026-03-02 09:00-05", "2026-03-02 09:30-05", "weekly", null, "America/New_York", "2026-03-01", "2026-03-17")).toEqual([
      "2026-03-02 09:00 Mon",
      "2026-03-09 09:00 Mon",
      "2026-03-16 09:00 Mon",
    ]);
  });

  it("gives showings the same id the app uses", async () => {
    const r = await db.query<{ a: string; b: string }>(
      `select public.occurrence_key('11111111-1111-1111-1111-111111111111', 'none', '2026-10-15 06:00Z') a,
              public.occurrence_key('11111111-1111-1111-1111-111111111111', 'weekly', '2026-10-15 06:00Z') b`,
    );
    const key = "11111111-1111-1111-1111-111111111111:2026-10-15T06:00:00.000Z";
    expect(r.rows[0]).toEqual({ a: key, b: key });
    // Same as JavaScript's toISOString(), which the app uses.
    expect(new Date("2026-10-15T06:00:00Z").toISOString()).toBe("2026-10-15T06:00:00.000Z");
  });

  it("writes the time in the reader's own time zone", async () => {
    const r = await db.query<{ nbo: string; ny: string; allday: string }>(
      `select public.reminder_body('2026-10-15 06:30Z', false, 'Thika', 'Africa/Nairobi') nbo,
              public.reminder_body('2026-10-15 06:30Z', false, '', 'America/New_York') ny,
              public.reminder_body('2026-10-15 06:30Z', true, 'x', 'Africa/Nairobi') allday`,
    );
    expect(r.rows[0]).toEqual({ nbo: "9:30 · Thika", ny: "2:30", allday: "Today" });
  });
});
