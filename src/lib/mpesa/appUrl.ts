import "server-only";
import { headers } from "next/headers";

/** The app's public address, which Safaricom calls back. APP_URL wins. */
export async function appUrl() {
  const fromEnv = process.env.APP_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  return host ? `${h.get("x-forwarded-proto") ?? "https"}://${host}` : "";
}
