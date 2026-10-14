import { CalendarApp } from "@/components/calendar/CalendarApp";
import { can, getViewer } from "@/lib/data/queries";
import { DEMO_VIEWERS } from "@/lib/data/demo-data";
import { isDemo } from "@/lib/demo";
import { supabaseServer } from "@/lib/supabase/server";
import { calendarsFor } from "@/lib/calendar/types";

export const metadata = { title: "Calendar" };

const LEDGER_NAMES: Record<string, string> = { company: "Trillionaire Designs", bidii: "Bidii" };

export default async function CalendarPage() {
  const viewer = await getViewer();

  // Everyone the person can invite or give tasks to, with the companies they are in.
  let people: { id: string; name: string; ledgers: string[] }[];
  let names = LEDGER_NAMES;
  if (isDemo()) {
    people = Object.values(DEMO_VIEWERS).map((v) => ({ id: v.id, name: v.name, ledgers: v.ledgers }));
  } else {
    const sb = await supabaseServer();
    const [{ data: rows }, { data: memberships }, { data: ledgers }] = await Promise.all([
      sb.from("people").select("id, full_name").eq("active", true).order("full_name"),
      sb.from("memberships").select("person_id, ledger_id, role"),
      sb.from("ledgers").select("id, name").eq("status", "active"),
    ]);
    const all = (ledgers ?? []).map((l) => l.id);
    names = Object.fromEntries((ledgers ?? []).map((l) => [l.id, l.name]));
    people = (rows ?? []).map((p) => {
      const mine = (memberships ?? []).filter((m) => m.person_id === p.id);
      return { id: p.id, name: p.full_name, ledgers: mine.some((m) => m.role === "td_cofounder") ? all : mine.map((m) => m.ledger_id) };
    });
  }

  const calendars = calendarsFor(viewer.ledgers);
  const assignIn = viewer.ledgers.filter((l) => can(viewer, l, "task_assigner"));

  return (
    <CalendarApp
      me={{ id: viewer.id, name: viewer.name }}
      people={people}
      calendars={calendars}
      calendarNames={names}
      assignIn={assignIn}
      demo={isDemo()}
    />
  );
}
