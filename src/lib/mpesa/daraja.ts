import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { callbackUrls, DARAJA_BASE, darajaError, SANDBOX_MSISDN, type DarajaEnvironment } from "./helpers";

// Calls to Safaricom Daraja. Runs only on the server: the keys come from
// Supabase Vault through the service role and never reach a browser.

export interface DarajaCredentials {
  ledgerId: string;
  enabled: boolean;
  environment: DarajaEnvironment;
  shortcode: string | null;
  shortcodeType: "paybill" | "till";
  consumerKey: string | null;
  consumerSecret: string | null;
  passkey: string | null;
  callbackToken: string | null;
}

export async function loadCredentials(): Promise<DarajaCredentials> {
  const { data, error } = await supabaseAdmin().rpc("mpesa_credentials").single<Record<string, string | boolean | null>>();
  if (error || !data) throw new Error(`Could not read the M-PESA settings: ${error?.message ?? "no settings row"}`);
  return {
    ledgerId: data.ledger_id as string,
    enabled: data.enabled === true,
    environment: data.environment as DarajaEnvironment,
    shortcode: data.shortcode as string | null,
    shortcodeType: data.shortcode_type as "paybill" | "till",
    consumerKey: data.consumer_key as string | null,
    consumerSecret: data.consumer_secret as string | null,
    passkey: data.passkey as string | null,
    callbackToken: data.callback_token as string | null,
  };
}

async function call(url: string, init: RequestInit) {
  let res: Response;
  try {
    res = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(20_000) });
  } catch (e) {
    throw new Error(`Could not reach Safaricom: ${(e as Error).message}`);
  }
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { errorMessage: text.slice(0, 200) };
  }
  return { ok: res.ok, status: res.status, body: body as Record<string, unknown> | null };
}

// Tokens last an hour; keep one per key until a minute before it runs out.
const tokens = new Map<string, { token: string; expires: number }>();

export async function accessToken(c: DarajaCredentials) {
  if (!c.consumerKey || !c.consumerSecret) throw new Error("Add the Consumer Key and Consumer Secret first.");
  const cacheKey = `${c.environment}:${c.consumerKey}`;
  const hit = tokens.get(cacheKey);
  if (hit && hit.expires > Date.now()) return hit.token;

  const basic = Buffer.from(`${c.consumerKey}:${c.consumerSecret}`).toString("base64");
  const r = await call(`${DARAJA_BASE[c.environment]}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${basic}` },
  });
  const token = r.body?.access_token;
  if (!r.ok || typeof token !== "string") throw new Error(darajaError(r.body, r.status));
  const seconds = Number(r.body?.expires_in ?? 3599);
  tokens.set(cacheKey, { token, expires: Date.now() + (seconds - 60) * 1000 });
  return token;
}

/** Tells Safaricom where to send C2B confirmations for this shortcode. */
export async function registerUrls(c: DarajaCredentials, appUrl: string) {
  if (!c.shortcode) throw new Error("Add the shortcode first.");
  if (!c.callbackToken) throw new Error("Save the settings first.");
  const urls = callbackUrls(appUrl, c.callbackToken);
  const r = await call(`${DARAJA_BASE[c.environment]}/mpesa/c2b/v1/registerurl`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await accessToken(c)}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      ShortCode: c.shortcode,
      // If the validation address can't be reached, Safaricom completes the payment anyway.
      ResponseType: "Completed",
      ConfirmationURL: urls.confirmation,
      ValidationURL: urls.validation,
    }),
  });
  const code = String(r.body?.ResponseCode ?? "");
  if (!r.ok || (code !== "0" && code !== "00000000")) throw new Error(darajaError(r.body, r.status));
  return String(r.body?.ResponseDescription ?? "Registered");
}

/** Sandbox only: asks Safaricom to send a test C2B payment to the shortcode. */
export async function simulatePayment(c: DarajaCredentials, amount: number, accountRef: string) {
  if (c.environment !== "sandbox") throw new Error("Test payments are only for the sandbox.");
  if (!c.shortcode) throw new Error("Add the shortcode first.");
  const r = await call(`${DARAJA_BASE.sandbox}/mpesa/c2b/v1/simulate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await accessToken(c)}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      ShortCode: c.shortcode,
      CommandID: c.shortcodeType === "till" ? "CustomerBuyGoodsOnline" : "CustomerPayBillOnline",
      Amount: Math.round(amount),
      Msisdn: SANDBOX_MSISDN,
      BillRefNumber: c.shortcodeType === "till" ? null : accountRef,
    }),
  });
  const code = String(r.body?.ResponseCode ?? "");
  if (!r.ok || code !== "0") throw new Error(darajaError(r.body, r.status));
  return String(r.body?.ResponseDescription ?? "Accepted");
}
