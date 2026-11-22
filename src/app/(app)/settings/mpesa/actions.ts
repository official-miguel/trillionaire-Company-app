"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { can, getViewer } from "@/lib/data/queries";
import { isDemo } from "@/lib/demo";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { accessToken, loadCredentials, registerUrls, simulatePayment } from "@/lib/mpesa/daraja";
import { appUrl } from "@/lib/mpesa/appUrl";
import { callbackUrlProblem } from "@/lib/mpesa/helpers";

const back = (q: string): never => redirect(`/settings/mpesa?${q}`);
const fail = (message: string): never => back(`error=${encodeURIComponent(message)}`);

async function requireEditor() {
  const viewer = await getViewer();
  if (!can(viewer, "bidii", "settings_editor")) back("error=not-allowed");
  return viewer;
}

/**
 * Saves the M-PESA settings. Keys left blank keep the saved ones. The keys go
 * straight to Supabase Vault; the database checks the permission again.
 */
export async function saveMpesaSettings(formData: FormData) {
  await requireEditor();
  if (isDemo()) back("saved=demo");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) back("error=reason");

  const sb = await supabaseServer();
  const { error } = await sb.rpc("mpesa_save_config", {
    p_enabled: formData.get("enabled") === "on",
    p_environment: String(formData.get("environment") ?? "sandbox"),
    p_shortcode: String(formData.get("shortcode") ?? "").replace(/\s/g, ""),
    p_shortcode_type: String(formData.get("shortcode_type") ?? "paybill"),
    p_consumer_key: String(formData.get("consumer_key") ?? ""),
    p_consumer_secret: String(formData.get("consumer_secret") ?? ""),
    p_passkey: String(formData.get("passkey") ?? ""),
    p_reason: reason,
  });
  if (error) fail(error.message);
  revalidatePath("/settings/mpesa");
  back("saved=1");
}

async function record(actor: string, action: "tested" | "registered", ok: boolean, detail: string) {
  const { error } = await supabaseAdmin().rpc("mpesa_set_status", { p_actor: actor, p_action: action, p_ok: ok, p_detail: detail });
  if (error) console.error("Could not record the M-PESA status:", error.message);
}

/** Asks Daraja for an access token with the saved keys. */
export async function testConnection() {
  const viewer = await requireEditor();
  if (isDemo()) back("tested=demo");
  let message: string;
  try {
    const c = await loadCredentials();
    await accessToken(c);
    message = `Connected to the Daraja ${c.environment}. The keys are accepted.`;
  } catch (e) {
    message = (e as Error).message;
    await record(viewer.id, "tested", false, message);
    revalidatePath("/settings/mpesa");
    fail(`The connection test failed: ${message}`);
  }
  await record(viewer.id, "tested", true, message!);
  revalidatePath("/settings/mpesa");
  back("tested=1");
}

/** Registers the confirmation and validation addresses for the shortcode. */
export async function registerCallbackUrls() {
  const viewer = await requireEditor();
  if (isDemo()) back("registered=demo");
  const url = await appUrl();
  let message: string;
  try {
    const c = await loadCredentials();
    const problem = url ? callbackUrlProblem(url, c.environment) : "Set APP_URL to the app's public https address.";
    if (problem) throw new Error(problem);
    message = `Safaricom will send ${c.shortcode}'s payments to ${url}. (${await registerUrls(c, url)})`;
  } catch (e) {
    message = (e as Error).message;
    await record(viewer.id, "registered", false, message);
    revalidatePath("/settings/mpesa");
    fail(`Registering the callback addresses failed: ${message}`);
  }
  await record(viewer.id, "registered", true, message!);
  revalidatePath("/settings/mpesa");
  back("registered=1");
}

/**
 * Sandbox only: Safaricom sends a test payment, which then comes back
 * through the real callback like any other. Nothing is recorded here.
 */
export async function sendTestPayment(formData: FormData) {
  await requireEditor();
  if (isDemo()) back("simulated=demo");
  const amount = Number(formData.get("amount"));
  const account = String(formData.get("account") ?? "").trim().slice(0, 20);
  if (!(amount >= 1 && amount <= 150000)) back("error=amount");
  try {
    const c = await loadCredentials();
    await simulatePayment(c, amount, account || "TEST");
  } catch (e) {
    fail(`The test payment was not sent: ${(e as Error).message}`);
  }
  back("simulated=1");
}
