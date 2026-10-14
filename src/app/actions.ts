"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isDemo } from "@/lib/demo";
import { supabaseServer } from "@/lib/supabase/server";
import { DEMO_COOKIE } from "@/lib/data/queries";

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
