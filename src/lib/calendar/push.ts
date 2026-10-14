"use client";

// Turning reminders on for this device: asks permission, subscribes the
// browser to Web Push, and saves its push address in Supabase. After that,
// reminders arrive even when the app is closed.
import { createBrowserClient } from "@supabase/ssr";

export type PushStatus = "unsupported" | "needs-install" | "off" | "on" | "blocked";

const client = () => createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}
function isInstalled() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}

export async function pushStatus(): Promise<PushStatus> {
  if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    // iPhone only offers push to apps added to the Home Screen.
    return isIos() && !isInstalled() ? "needs-install" : "unsupported";
  }
  if (Notification.permission === "denied") return "blocked";
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "on" : "off";
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function turnOnPush(): Promise<PushStatus> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "blocked" : "off";

  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const reg = await navigator.serviceWorker.getRegistration();
  // Without the service worker (development) or the key, reminders still
  // show while the app is open.
  if (!key || !reg) return "on";

  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) }));
  const json = sub.toJSON();
  const { error } = await client().rpc("save_push_subscription", {
    p_endpoint: sub.endpoint,
    p_p256dh: json.keys?.p256dh ?? "",
    p_auth: json.keys?.auth ?? "",
    p_user_agent: navigator.userAgent,
  });
  if (error) throw error;
  return "on";
}

/** On sign-out: stop this device getting the last person's reminders. */
export async function turnOffPush(): Promise<void> {
  const reg = await navigator.serviceWorker?.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await client().rpc("remove_push_subscription", { p_endpoint: sub.endpoint }).then(() => undefined, () => undefined);
  await sub.unsubscribe().catch(() => false);
}
