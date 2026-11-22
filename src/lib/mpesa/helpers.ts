// M-PESA helpers with no secrets in them, shared by the server and tests.

export type DarajaEnvironment = "sandbox" | "production";

export const DARAJA_BASE: Record<DarajaEnvironment, string> = {
  sandbox: "https://sandbox.safaricom.co.ke",
  production: "https://api.safaricom.co.ke",
};

/** The sandbox test phone Safaricom uses for simulated C2B payments. */
export const SANDBOX_MSISDN = "254708374149";

// Daraja refuses callback addresses containing these words (Daraja docs,
// "Register URL"), so the routes are under /api/payments/c2b.
const BLOCKED_WORDS = ["m-pesa", "mpesa", "safaricom", "exe", "exec", "cmd", "sql", "query"];

export function callbackUrls(appUrl: string, token: string) {
  const base = `${appUrl.replace(/\/+$/, "")}/api/payments/c2b/${token}`;
  return { confirmation: `${base}/confirmation`, validation: `${base}/validation` };
}

/** Why Daraja would refuse this callback address, or null if it's fine. */
export function callbackUrlProblem(appUrl: string, environment: DarajaEnvironment): string | null {
  let url: URL;
  try {
    url = new URL(appUrl);
  } catch {
    return "APP_URL is not a valid address. Set it to the app's public address, for example https://app.example.com.";
  }
  if (environment === "production" && url.protocol !== "https:") return "Production callbacks must use https.";
  if (["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) return "Safaricom cannot reach localhost. Use the app's public address (or a tunnel for sandbox testing).";
  const lower = url.href.toLowerCase();
  const word = BLOCKED_WORDS.find((w) => lower.includes(w));
  if (word) return `Daraja refuses callback addresses that contain "${word}". Use an address without it.`;
  return null;
}

/** The address shown in Settings: the secret part is hidden. */
export function maskedCallbackUrl(url: string) {
  return url.replace(/\/c2b\/([a-f0-9]{4})[a-f0-9]+([a-f0-9]{4})\//, "/c2b/$1…$2/");
}

/** The caller's address as seen by the app (behind Vercel or another proxy). */
export function clientIp(headers: Headers) {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip") || "";
}

/** True when no allowlist is set, or the address is on it. */
export function ipAllowed(ip: string, allowlist: string | undefined) {
  const list = (allowlist ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return list.length === 0 || list.includes(ip);
}

/** Daraja's own words for an error, from a response body. */
export function darajaError(body: unknown, status: number) {
  const b = (body ?? {}) as Record<string, unknown>;
  const text = b.errorMessage ?? b.ResponseDescription ?? b.error_description ?? b.resultDesc;
  return typeof text === "string" && text ? `${text} (HTTP ${status})` : `Safaricom answered with HTTP ${status}.`;
}

/** Only letters, digits, spaces and + - . for a search box. */
export function cleanSearch(q: string | undefined) {
  return (q ?? "").replace(/[^A-Za-z0-9 +\-.]/g, "").trim().slice(0, 40);
}
