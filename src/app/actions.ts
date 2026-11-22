"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isDemo } from "@/lib/demo";
import { supabaseServer } from "@/lib/supabase/server";
import { DEMO_COOKIE } from "@/lib/data/queries";
import { getNotifications, markNotificationsRead } from "@/lib/data/notifications";

/** The bell asks for its notifications again (on open, on focus, every minute). */
export async function listNotifications() {
  return getNotifications();
}

/** Marks the given notifications read, or all of them when ids is null. */
export async function readNotifications(ids: string[] | null) {
  await markNotificationsRead(ids && ids.map(String).slice(0, 100));
}

export async function signOut() {
  if (!isDemo()) {
    const sb = await supabaseServer();
    await sb.auth.signOut();
  }
  redirect("/login");
}

export async function setDemoViewer(formData: FormData) {
  if (!isDemo()) return;
  (await cookies()).set(DEMO_COOKIE, String(formData.get("as") ?? "miguel"), { path: "/", sameSite: "lax" });
  redirect("/");
}
